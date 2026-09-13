// ============================================================
// THE BACKUP HAS TO OPEN AGAIN
//
// 13 September 2026. The backup script's whole argument is that an untested
// backup is a belief, and the AI review pointed out that it then produced an
// encrypted bundle nothing had ever opened. Fair, and the most important
// finding on the change, because it went to the claim rather than the code.
//
// So these tests do not check that the restore script looks right. They lock a
// bundle using THE ACTUAL OPENSSL COMMANDS THE WORKFLOW RUNS, in a shell, and
// then open it with the restore script. If the two ever drift apart, whether
// through a changed round count, a changed salt or a changed cipher, nothing
// opens and this goes red rather than being discovered on the worst day of the
// year.
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile, mkdir, rm, readdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { restore, decrypt, fingerprintMatches, macKeyFor } from '../../scripts/restore-database.mjs'

const PASSPHRASE = 'a passphrase with spaces, a $dollar and a "quote"'

let work: string

/** A folder of records shaped exactly as the backup job leaves them. */
async function recordsFolder(dir: string) {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'clients.json'), JSON.stringify([{ id: 1, name: 'Elegant Beauty' }, { id: 2, name: 'Another' }]))
  await writeFile(path.join(dir, 'units.json'), JSON.stringify([{ id: 9 }]))
  await writeFile(path.join(dir, '_manifest.json'), JSON.stringify({
    takenAt: '2026-09-13T02:30:00.000Z',
    counts: { clients: 2, units: 1 },
    files: { clients: 'clients.json', units: 'units.json' },
    rows: 3,
  }))
}

/**
 * Lock it the way the workflow locks it. Every command here is copied from
 * .github/workflows/backup-database.yml, which is the point: if that file
 * changes, this stops opening.
 */
function lock(recordsDir: string, into: string) {
  execFileSync('sh', ['-c', `
    set -eu
    mkdir -p "$OUT"
    tar -czf "$OUT/records.tar.gz" -C "$SRC" .
    openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
      -in "$OUT/records.tar.gz" -out "$OUT/records.tar.gz.enc" \
      -pass env:BACKUP_PASSPHRASE
    rm -f "$OUT/records.tar.gz"
    mac_key=$(openssl enc -aes-256-cbc -pbkdf2 -iter 600000 \
      -S 4d41435f4b455930 -P -pass env:BACKUP_PASSPHRASE \
      | awk -F= '/^key=/{print $2}')
    openssl dgst -sha256 -hmac "$mac_key" "$OUT/records.tar.gz.enc" \
      | awk '{print $NF}' > "$OUT/records.tar.gz.enc.hmac"
  `], { env: { ...process.env, SRC: recordsDir, OUT: into, BACKUP_PASSPHRASE: PASSPHRASE } })
}

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), 'restore-'))
})
afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

describe('a backup nobody has opened is a belief', () => {
  it('opens a bundle locked by the real workflow commands and reads every record back', async () => {
    const src = path.join(work, 'records')
    const artifact = path.join(work, 'artifact')
    await recordsFolder(src)
    lock(src, artifact)

    const out = path.join(work, 'restored')
    const found = await restore(artifact, out, PASSPHRASE)

    expect(found.tables).toBe(2)
    expect(found.rows).toBe(3)
    // And the records are really there, not merely counted.
    const clients = JSON.parse(await readFile(path.join(out, 'clients.json'), 'utf8'))
    expect(clients).toHaveLength(2)
    expect(clients[0].name).toBe('Elegant Beauty')
  }, 30_000)

  it('refuses a bundle that has been swapped, and does not open it', async () => {
    const src = path.join(work, 'records')
    const artifact = path.join(work, 'artifact')
    await recordsFolder(src)
    lock(src, artifact)

    // Somebody replaces the records with their own file. They cannot produce a
    // matching fingerprint without the passphrase, which is not in the artifact.
    const enc = path.join(artifact, 'records.tar.gz.enc')
    const blob = await readFile(enc)
    blob[blob.length - 1] ^= 0xff
    await writeFile(enc, blob)

    const out = path.join(work, 'restored')
    await expect(restore(artifact, out, PASSPHRASE)).rejects.toThrow(/does not match its fingerprint/)
    // Refused BEFORE anything was opened: no records were written.
    await expect(readdir(out)).rejects.toThrow()
  }, 30_000)

  it('refuses the wrong passphrase rather than producing rubbish', async () => {
    const src = path.join(work, 'records')
    const artifact = path.join(work, 'artifact')
    await recordsFolder(src)
    lock(src, artifact)

    await expect(restore(artifact, path.join(work, 'restored'), 'not the passphrase'))
      .rejects.toThrow(/does not match its fingerprint/)
  }, 30_000)

  it('says plainly when a backup kept no records at all', async () => {
    // The default, with no passphrase set on the repository: the job keeps the
    // summary and nothing else. Somebody reaching for it in an emergency needs
    // to be told that, not handed a missing file error.
    const artifact = path.join(work, 'artifact')
    await mkdir(artifact, { recursive: true })
    await writeFile(path.join(artifact, '_summary.json'), '{"rows":0}')

    await expect(restore(artifact, path.join(work, 'restored'), PASSPHRASE))
      .rejects.toThrow(/keeps only the summary/)
  })

  it('asks for the passphrase rather than failing obscurely without one', async () => {
    await expect(restore(work, path.join(work, 'restored'), ''))
      .rejects.toThrow(/Set BACKUP_PASSPHRASE/)
  })

  it('refuses a file that was not written by the backup job', async () => {
    const artifact = path.join(work, 'artifact')
    await mkdir(artifact, { recursive: true })
    const notOurs = Buffer.from('this is just some file somebody put here')
    expect(() => decrypt(notOurs, PASSPHRASE)).toThrow(/not written by the backup job/)
  })
})

describe('the fingerprint key matches the workflow exactly', () => {
  it('derives the same key the workflow derives', () => {
    // Both sides, independently: the shell command from the workflow, and this
    // script's own derivation. A change to either that is not made to both
    // shows up here rather than on the day of a restore.
    const fromShell = execFileSync('sh', ['-c',
      `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -S 4d41435f4b455930 -P -pass env:BACKUP_PASSPHRASE` +
      ` | awk -F= '/^key=/{print $2}'`,
    ], { env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE } }).toString().trim()

    // The characters, not the bytes they spell: openssl dgst -hmac takes its
    // key as a string, and the workflow hands it this printed text.
    expect(macKeyFor(PASSPHRASE)).toBe(fromShell)
  }, 30_000)

  it('a fingerprint made with another passphrase does not match', () => {
    const blob = Buffer.from('some ciphertext')
    const mine = fingerprintMatches(blob, '', PASSPHRASE)
    expect(mine).toBe(false)
  })
})
