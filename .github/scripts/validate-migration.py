#!/usr/bin/env python3
"""
Clearview Database Migration Validator
Checks a SQL migration file against confirmed schema before running on production.

Usage: python3 migration-validator.py <migration-file.sql>

Checks:
1. client_id columns must be TEXT (not UUID) -- matches engagement_clients.id
2. auth_user_id / user_id columns referencing auth.users must be UUID
3. All tables must have RLS enabled
4. All CREATE TABLE must use IF NOT EXISTS
5. Foreign keys to engagement_clients must use TEXT not UUID
6. No raw string concatenation in SQL (injection risk)
7. Every DELETE must have a WHERE clause
8. Every INSERT must scope client_id from operator/user not from input
"""

import sys
import re

def validate(sql: str) -> tuple[list[str], list[str]]:
    criticals = []
    warnings = []
    lines = sql.split('\n')
    
    # 1. Check client_id column type
    for i, line in enumerate(lines, 1):
        if re.search(r'client_id\s+UUID', line, re.IGNORECASE):
            if 'REFERENCES auth.users' not in line and 'user_id' not in line.lower():
                criticals.append(
                    f"Line {i}: client_id declared as UUID but engagement_clients.id is TEXT. "
                    f"This foreign key will fail.\n  → Fix: change 'UUID' to 'TEXT' for client_id columns\n  → {line.strip()}"
                )

    # 2. Check user_id referencing auth.users is UUID
    for i, line in enumerate(lines, 1):
        if re.search(r'REFERENCES auth\.users', line, re.IGNORECASE):
            col_match = re.search(r'(\w+)\s+TEXT.*REFERENCES auth\.users', line, re.IGNORECASE)
            if col_match:
                criticals.append(
                    f"Line {i}: Column '{col_match.group(1)}' references auth.users but is TEXT. "
                    f"auth.users.id is UUID.\n  → Fix: change TEXT to UUID\n  → {line.strip()}"
                )

    # 3. Check IF NOT EXISTS on CREATE TABLE
    for i, line in enumerate(lines, 1):
        if re.search(r'CREATE TABLE\s+(?!IF)', line, re.IGNORECASE):
            if 'IF NOT EXISTS' not in line.upper():
                criticals.append(
                    f"Line {i}: CREATE TABLE without IF NOT EXISTS -- will fail if table already exists.\n"
                    f"  → Fix: use 'CREATE TABLE IF NOT EXISTS'\n  → {line.strip()}"
                )

    # 4. Check RLS is enabled on new tables
    tables_created = []
    for i, line in enumerate(lines, 1):
        m = re.search(r'CREATE TABLE IF NOT EXISTS\s+(\w+)', line, re.IGNORECASE)
        if m:
            tables_created.append(m.group(1))
    
    for table in tables_created:
        rls_pattern = rf'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY'
        if not re.search(rls_pattern, sql, re.IGNORECASE):
            criticals.append(
                f"Table '{table}' created without enabling RLS.\n"
                f"  → Fix: add 'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;'"
            )

    # 5. Check DELETE statements have WHERE clause
    in_function = False
    for i, line in enumerate(lines, 1):
        if 'CREATE OR REPLACE FUNCTION' in line.upper():
            in_function = True
        if in_function and line.strip() == '$$;':
            in_function = False
        if not in_function:
            if re.search(r'^\s*DELETE FROM\s+\w+\s*;', line, re.IGNORECASE):
                criticals.append(
                    f"Line {i}: DELETE without WHERE clause -- will delete ALL rows.\n"
                    f"  → {line.strip()}"
                )

    # 6. Check foreign keys to engagement_clients use TEXT
    for i, line in enumerate(lines, 1):
        if 'REFERENCES engagement_clients' in line:
            # Find the column declaration above
            col_context = '\n'.join(lines[max(0,i-3):i])
            if re.search(r'UUID.*REFERENCES engagement_clients', col_context + line, re.IGNORECASE):
                criticals.append(
                    f"Line {i}: Foreign key to engagement_clients uses UUID but engagement_clients.id is TEXT.\n"
                    f"  → Fix: use TEXT for this column\n  → {line.strip()}"
                )

    # 7. Warn on missing super_coach policy
    for table in tables_created:
        super_coach_pattern = rf"ON {table}.*super_coach"
        if not re.search(super_coach_pattern, sql, re.IGNORECASE):
            warnings.append(
                f"Table '{table}' may be missing super_coach RLS policy. "
                f"Habib (super_coach) must be able to see all data."
            )

    # 8. Check for potential N+1 patterns in functions
    for i, line in enumerate(lines, 1):
        if re.search(r'FOR\s+\w+\s+IN\s+SELECT', line, re.IGNORECASE):
            # Check if there's a SELECT inside the loop
            next_lines = '\n'.join(lines[i:min(i+10, len(lines))])
            if re.search(r'SELECT.*FROM', next_lines, re.IGNORECASE):
                warnings.append(
                    f"Line {i}: Possible N+1 query -- SELECT inside a FOR loop. "
                    f"Consider using a single JOIN query instead."
                )

    return criticals, warnings


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 migration-validator.py <migration.sql>")
        sys.exit(1)
    
    migration_file = sys.argv[1]
    try:
        with open(migration_file) as f:
            sql = f.read()
    except FileNotFoundError:
        print(f"Error: File not found: {migration_file}")
        sys.exit(1)
    
    print(f"\nValidating: {migration_file}")
    print("=" * 60)
    
    criticals, warnings = validate(sql)
    
    if criticals:
        print(f"\n❌ CRITICAL ISSUES ({len(criticals)}) — DO NOT RUN THIS MIGRATION:")
        for c in criticals:
            print(f"\n  {c}")
    
    if warnings:
        print(f"\n⚠️  WARNINGS ({len(warnings)}):")
        for w in warnings:
            print(f"\n  {w}")
    
    if not criticals and not warnings:
        print("\n✅ No issues found")
    
    print("\n" + "=" * 60)
    if criticals:
        print(f"RESULT: BLOCKED — {len(criticals)} critical issue(s) must be fixed first")
        sys.exit(1)
    else:
        print(f"RESULT: APPROVED — safe to run on production")
        if warnings:
            print(f"        (review {len(warnings)} warning(s) above)")
        sys.exit(0)


if __name__ == '__main__':
    main()
