// ============================================================
// OPENING THE BACKUP AGAIN
//
// 13 September 2026. The backup script argues that an untested backup is a
// belief, and then produced an encrypted bundle that nothing on earth had ever
// opened. The AI review said so plainly and it was right: encrypting the
// records and walking away is not a backup, it is a file.
//
// This is the other half. Given a downloaded artifact and the passphrase it
// was locked with, it checks the fingerprint, opens the bundle, and reads
// every record back with the same verification the nightly job uses. It is
// what somebody runs at the worst moment of the year, so it is written to be
// run by somebody who has never read it:
//
//   BACKUP_PASSPHRASE='...' node scripts/restore-database.mjs ./downloaded-artifact
//
// It writes the records to a folder and stops there. IT NEVER WRITES TO A
// DATABASE. Putting records back into a live project is a decision with a
// person's name against it, not something a script should be able to do by
// being run with the wrong argument.
//
// THE FINGERPRINT IS CHECKED BEFORE ANYTHING IS OPENED. A bundle that does not
// match is refused and not decrypted at all. Somebody who can replace the
// artifact cannot make this read their file instead, because producing a
// matching fingerprint needs the passphrase, which is not in the artifact.
//
// The key derivation here must match the workflow exactly or nothing ever
// opens. Both sides are PBKDF2-SHA256 at 600,000 rounds; the encryption uses
// the random salt OpenSSL wrote into the file, and the fingerprint uses the
// fixed salt below. A test locks a bundle with the real openssl commands the
// workflow runs and opens it with this file, so the two cannot drift apart
// without something going red.
// ============================================================
import { createHmac, pbkdf2Sync, timingSafeEqual, createDecipheriv } from 'node:crypto'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { verify } from './backup-database.mjs'

/** Must match the workflow's `-iter`, or nothing ever opens. */
const ROUNDS = 600_000
/** Must match the workflow's `-S`. A salt is not a secret; this one is public
 *  so that a restore can be reproduced by anybody holding the passphrase. */
const MAC_SALT = Buffer.from('4d41435f4b455930', 'hex')
/** OpenSSL writes this, then the eight salt bytes, then the ciphertext. */
const MAGIC = Buffer.from('Salted__', 'utf8')

/**
 * The fingerprint key: the passphrase, at the same cost as the encryption.
 *
 * RETURNED AS TEXT, NOT BYTES, AND THAT IS NOT A DETAIL. The workflow derives
 * this with `openssl enc -P`, which prints the key as hexadecimal, and then
 * passes that printed text to `openssl dgst -hmac`, which takes its key as a
 * string. So the key is the sixty four characters, not the thirty two bytes
 * they spell. My first version here used the bytes, the fingerprints did not
 * match, and the round trip test caught it. Uppercase, because that is what
 * OpenSSL prints and the characters are the key.
 */
export function macKeyFor(passphrase) {
  return pbkdf2Sync(passphrase, MAC_SALT, ROUNDS, 32, 'sha256').toString('hex').toUpperCase()
}

/**
 * Does this bundle carry the fingerprint only the passphrase could produce?
 *
 * Compared in constant time. The difference is unlikely to matter for a file
 * somebody downloaded by hand, and it costs nothing to not have to think about
 * it.
 */
export function fingerprintMatches(ciphertext, claimed, passphrase) {
  const made = createHmac('sha256', macKeyFor(passphrase)).update(ciphertext).digest('hex')
  const a = Buffer.from(made, 'utf8')
  const b = Buffer.from(String(claimed || '').trim().toLowerCase(), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Undo `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt`.
 *
 * OpenSSL puts the salt it chose in the first sixteen bytes, so the key and
 * the starting block are derived from the file itself rather than stored
 * anywhere. A file that does not begin the way OpenSSL begins its files is
 * refused here rather than producing rubbish further down.
 */
export function decrypt(blob, passphrase) {
  if (blob.length < 16 || !blob.subarray(0, 8).equals(MAGIC)) {
    throw new Error('That file was not written by the backup job: it does not begin the way an OpenSSL bundle begins.')
  }
  const salt = blob.subarray(8, 16)
  const keyAndIv = pbkdf2Sync(passphrase, salt, ROUNDS, 48, 'sha256')
  const decipher = createDecipheriv('aes-256-cbc', keyAndIv.subarray(0, 32), keyAndIv.subarray(32, 48))
  return Buffer.concat([decipher.update(blob.subarray(16)), decipher.final()])
}

/**
 * Open a downloaded artifact and read every record in it back.
 *
 * `from` is the folder the artifact was unzipped into. `into` is where the
 * records are written. Returns what was found, so a caller can print it.
 */
export async function restore(from, into, passphrase) {
  if (!passphrase) {
    throw new Error('Set BACKUP_PASSPHRASE to the passphrase this backup was locked with.')
  }

  const enc = path.join(from, 'records.tar.gz.enc')
  const mac = path.join(from, 'records.tar.gz.enc.hmac')

  let blob
  try {
    blob = await readFile(enc)
  } catch {
    throw new Error(
      `No records were found in ${from}. A backup taken without BACKUP_PASSPHRASE set keeps only the summary, ` +
      'not the records themselves.',
    )
  }

  let claimed
  try {
    claimed = await readFile(mac, 'utf8')
  } catch {
    throw new Error('The fingerprint file is missing, so this bundle cannot be shown to be the one that was taken.')
  }

  // BEFORE ANYTHING IS OPENED. A bundle that does not match is not decrypted.
  if (!fingerprintMatches(blob, claimed, passphrase)) {
    throw new Error(
      'This bundle does not match its fingerprint. Either the passphrase is wrong, or the file is not the one ' +
      'the backup job wrote. It has not been opened.',
    )
  }

  await rm(into, { recursive: true, force: true })
  await mkdir(into, { recursive: true })

  const tarball = path.join(into, 'records.tar.gz')
  await writeFile(tarball, decrypt(blob, passphrase))
  execFileSync('tar', ['-xzf', tarball, '-C', into])
  await rm(tarball, { force: true })

  // The same reading back the nightly job does. A bundle that opens but will
  // not parse is the failure this whole thing exists to catch.
  const found = await verify(into)
  return { ...found, into }
}

/* c8 ignore start */
if (process.argv[1] && process.argv[1].endsWith('restore-database.mjs')) {
  const from = process.argv[2]
  const into = process.argv[3] || path.join(from || '.', 'restored')
  if (!from) {
    console.error('Usage: BACKUP_PASSPHRASE=... node scripts/restore-database.mjs <downloaded-artifact-folder> [where-to-put-it]')
    process.exit(1)
  }
  restore(from, into, process.env.BACKUP_PASSPHRASE)
    .then(({ tables, rows, into: where }) => {
      console.log(`Opened and read back: ${tables} tables, ${rows} rows, written to ${where}`)
      console.log('Nothing has been written to any database. That is a separate decision.')
    })
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
}
/* c8 ignore stop */
