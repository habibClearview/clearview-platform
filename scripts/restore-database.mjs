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
// It will not empty a folder that has anything in it unless --force is added,
// and it will not write into the folder holding the backup at all.
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
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath, readdir, rename } from 'node:fs/promises'
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
 * Where a path actually is on disk, following any links.
 *
 * The output folder need not exist yet, so this walks up to the deepest part
 * that does exist, asks the filesystem where that is, and puts the rest back
 * on the end. A path with nothing real in it at all is simply tidied, which is
 * all that can be said about it.
 */
async function canonical(target) {
  let head = path.resolve(target)
  const tail = []
  for (;;) {
    try {
      return path.join(await realpath(head), ...tail)
    } catch {
      const parent = path.dirname(head)
      if (parent === head) return path.resolve(target)
      tail.unshift(path.basename(head))
      head = parent
    }
  }
}

/**
 * Open a downloaded artifact and read every record in it back.
 *
 * `from` is the folder the artifact was unzipped into. `into` is where the
 * records are written. Returns what was found, so a caller can print it.
 */
export async function restore(from, into, passphrase, { force = false } = {}) {
  if (!passphrase) {
    throw new Error('Set BACKUP_PASSPHRASE to the passphrase this backup was locked with.')
  }

  // IT MUST NOT DESTROY THE THING IT IS RECOVERING. 13 September 2026,
  // CodeRabbit, and the worst fault it has found on this change, because of
  // when it would have happened. The records are written into a folder this
  // empties first, and nothing checked what that folder was. Run it as
  //
  //   node scripts/restore-database.mjs ./artifact ./artifact
  //
  // and it deletes the backup it just read, then reports success. Point it at
  // the folder the artifact sits in and it takes everything else in there too.
  // Somebody doing this is having the worst day of their year and is typing
  // paths in a hurry. It refuses instead.
  //
  // AND THE NAME IS NOT THE PLACE. CodeRabbit again, on my own fix. Resolving
  // a path only tidies up the text of it: it does not follow a link. If
  // ./artifact-link points at ./downloads/artifact, then comparing the two
  // names says ./downloads does not hold ./artifact-link, the check passes,
  // and deleting ./downloads takes the real artifact with it through the link.
  // Both sides are asked where they actually are on disk now, so the
  // comparison is between places rather than between names.
  const src = await canonical(from)
  const dest = await canonical(into)
  const rel = path.relative(dest, src)
  const destHoldsSrc = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  if (destHoldsSrc) {
    throw new Error(
      `Refusing to write the records into ${dest}, because the backup itself is in there and would be deleted. ` +
      'Give a folder somewhere else, or leave the second argument off and one will be made alongside it.',
    )
  }

  const enc = path.join(src, 'records.tar.gz.enc')
  const mac = path.join(src, 'records.tar.gz.enc.hmac')

  let blob
  try {
    blob = await readFile(enc)
  } catch {
    throw new Error(
      `No records were found in ${src}. A backup taken without BACKUP_PASSPHRASE set keeps only the summary, ` +
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

  // AND IT DOES NOT EMPTY A FOLDER SOMEBODY IS USING. The AI review, and the
  // same family as the fault above: the guard stops it destroying the backup,
  // and said nothing about the operator's own files. Pointing this at a folder
  // with anything else in it would have taken that too, silently. An empty
  // folder, or one that does not exist yet, is the ordinary case and needs no
  // ceremony; anything else has to be said out loud with --force.
  let occupants = []
  let destExists = true
  try { occupants = await readdir(dest) } catch { destExists = false }
  if (occupants.length && !force) {
    throw new Error(
      `${dest} is not empty, and everything in it would be deleted. Choose an empty folder, or add --force ` +
      'if you are certain there is nothing in there you want.',
    )
  }

  // NOTHING IS DESTROYED UNTIL THERE IS SOMETHING TO PUT THERE. CodeRabbit:
  // emptying the folder and then decrypting meant that a bundle which would
  // not open, or would not parse, left the operator with neither their old
  // restore nor a new one. On the day somebody runs this, a half finished
  // restore that ate the previous attempt is close to the worst outcome
  // available.
  //
  // So it is built beside the folder, read back there, and only swapped in
  // once it has been proved sound. A failure anywhere before that leaves
  // everything exactly as it was.
  // A NAME NOBODY ELSE CAN ALREADY HAVE. A fixed name beside the destination
  // would be emptied without asking, and somebody could reasonably have a
  // folder of their own called that. My next attempt, the process number and
  // the moment, was still only unlikely to collide rather than unable to:
  // mkdir with recursive accepts a folder that is already there, so two
  // restores in the same process in the same millisecond, or a leftover from
  // a previous crash, would have been written into and then moved. mkdtemp
  // creates the folder as part of choosing the name and fails if it cannot,
  // which is the difference between improbable and impossible. It is still a
  // sibling of the destination, so the final rename stays on one filesystem.
  const staging = await mkdtemp(`${dest}.restoring-`)

  let found
  try {
    const tarball = path.join(staging, 'records.tar.gz')
    await writeFile(tarball, decrypt(blob, passphrase))
    execFileSync('tar', ['-xzf', tarball, '-C', staging])
    await rm(tarball, { force: true })

    // The same reading back the nightly job does. A bundle that opens but will
    // not parse is the failure this whole thing exists to catch.
    found = await verify(staging)
  } catch (e) {
    await rm(staging, { recursive: true, force: true })
    throw e
  }

  // THE OLD ONE IS STEPPED ASIDE, NOT DESTROYED. Guarding the two halves of
  // the swap together was not enough: deleting the destination and then
  // failing to move the new records in still left somebody with no restore
  // where they expected one. Moving the old one out of the way first means a
  // failure at any point can be undone, so the worst case is that nothing
  // happened rather than that something was lost.
  const rollback = `${staging}.previous`
  let steppedAside = false
  try {
    if (destExists) {
      await rename(dest, rollback)
      steppedAside = true
    }
    await rename(staging, dest)
  } catch (e) {
    if (steppedAside) {
      // Put it back exactly as it was. If even this fails, say both places.
      try {
        await rename(rollback, dest)
      } catch {
        throw new Error(
          `The records were read back in full but could not be put in ${dest} (${e.message}). ` +
          `The new records are in ${staging} and what was there before is in ${rollback}.`,
        )
      }
    }
    throw new Error(
      `The records were read back in full but could not be put in ${dest} (${e.message}). ` +
      `Nothing was lost: the new records are in ${staging}.`,
    )
  }
  // Best effort, and deliberately silent. By here the records are in place
  // and read back; failing the whole restore because a spare copy would not
  // clear up would tell an operator their restore failed when it did not, and
  // a false alarm on a day like that is worse than a folder left behind.
  await rm(rollback, { recursive: true, force: true }).catch(() => {})
  return { ...found, into: dest }
}

/* c8 ignore start */
if (process.argv[1] && process.argv[1].endsWith('restore-database.mjs')) {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const [from, given] = args.filter((a) => a !== '--force')
  const into = given || path.join(from || '.', 'restored')
  if (!from) {
    console.error('Usage: BACKUP_PASSPHRASE=... node scripts/restore-database.mjs <downloaded-artifact-folder> [where-to-put-it] [--force]')
    process.exit(1)
  }
  restore(from, into, process.env.BACKUP_PASSPHRASE, { force })
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
