# Clearview Platform — Full Codebase Audit Request

## @coderabbitai full review

Please perform a comprehensive review of the entire codebase with focus on:

### Critical Areas to Audit

1. **Intake Form** (`src/components/intake/ClientIntakeForm.tsx`)
   - React state captured correctly at submit time (currentProducts, currentFigureData)
   - No state mutations during render
   - Revenue key consistency: `${product.id}_rev` format throughout
   - intake.client_id used to link to existing client, not create new one
   - Cost lines save correctly even without a name if figures are entered

2. **Generic Engine** (`src/lib/generic-engine.ts`)
   - All numeric settings use `??` not `||` (falsy-zero bug)
   - Balance sheet balances every month
   - inv_cash[0] set from fixed_assets
   - opening_cash_balance seeded into retained earnings

3. **CONAS Engine** (`src/lib/conas-engine.ts`)
   - irrigationKits uses cumulative not annual total
   - invCash[0] set from fixedAssets
   - Balance sheet balances

4. **Field API Routes** (`app/api/field/`)
   - Every route validates token before data access
   - client_id always comes from validated operator, never from request body
   - aggregate_field_transactions() called after every sync

5. **All API Routes** (`app/api/`)
   - SUPABASE_SERVICE_ROLE_KEY used not anon key
   - Graceful handling when ANTHROPIC_API_KEY is absent
   - All routes return proper status codes

6. **Database Type Safety**
   - engagement_clients.id is TEXT not UUID
   - user_profiles.client_id is UUID
   - Any join between these two needs explicit cast

7. **Generic Dashboard** (`src/components/generic/GenericDashboard.tsx`)
   - No `||` used for numeric inputs (use `??`)
   - All 10 tabs have correct function definitions
   - No old standalone views still wired

8. **CONAS Dashboard** (`src/components/conas/CONASDashboard.tsx`)
   - 11 tabs correctly consolidated
   - No standalone opcashflow, spends, scenarios, team tabs

### Known Bug Patterns to Check For
- `value={x||''}` on number inputs — should be `value={x??''}`
- `setProducts()` called during render — must only be called in useEffect or event handlers
- `useEffect` used to sync refs for async reads — stale state risk
- Variables named `k` used where `key` was intended
- Missing `await` on Supabase calls in submit functions
- Missing `.eq('client_id', operator.client_id)` scope on any DB query in field routes

Please flag ALL issues found, grouped by severity (CRITICAL / WARNING).
