/**
 * Build backend.tar.gz: a self-contained Linux backend for the user's WSL distro.
 *
 *   python/  standalone CPython (relocatable, from uv) with the locked dependencies and memmon
 *   ui/      the built web UI, served by memmon
 *
 * Dependencies are installed from the lockfile with --require-hashes. The tarball is
 * packed with sorted entries, fixed owners and mtimes; its SHA-256 goes into the app's
 * config.json so the app can verify it before unpacking.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import path from 'node:path'

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { stdio: 'inherit', shell: false, ...options })
  if (result.status !== 0) throw new Error(`${file} ${args.join(' ')} failed (exit ${result.status})`)
  return result
}

/** Parts of CPython the backend never uses (GUI toolkit, IDE, headers, pip bootstrap). */
const UNUSED = [
  'include',
  'share',
  'lib/python3.12/idlelib',
  'lib/python3.12/tkinter',
  'lib/python3.12/turtledemo',
  'lib/python3.12/ensurepip',
  'lib/python3.12/test',
]
const UNUSED_LIB = /^(tcl|tk|itcl|thread|libtcl|libtk)/i

export function buildBackendBundle({ repo, workDir, outFile }) {
  const backend = path.join(repo, 'backend')
  rmSync(workDir, { recursive: true, force: true })
  const stage = path.join(workDir, 'stage')
  const python = path.join(stage, 'python')
  mkdirSync(stage, { recursive: true })

  console.log('  · copying the standalone Python')
  const interpreter = realpathSync(path.join(backend, '.venv', 'bin', 'python'))
  const pythonHome = path.dirname(path.dirname(interpreter))
  if (!existsSync(path.join(pythonHome, 'BUILD')) && !existsSync(path.join(pythonHome, 'lib', 'libpython3.12.so'))) {
    throw new Error(`${pythonHome} does not look like a uv-managed standalone Python`)
  }
  cpSync(pythonHome, python, { recursive: true, verbatimSymlinks: true })
  for (const part of UNUSED) rmSync(path.join(python, part), { recursive: true, force: true })
  for (const name of readdirSync(path.join(python, 'lib'))) {
    if (UNUSED_LIB.test(name)) rmSync(path.join(python, 'lib', name), { recursive: true, force: true })
  }
  for (const name of readdirSync(path.join(python, 'lib', 'python3.12', 'lib-dynload'))) {
    if (name.startsWith('_tkinter')) rmSync(path.join(python, 'lib', 'python3.12', 'lib-dynload', name))
  }

  console.log('  · installing locked dependencies (hash-checked) and memmon')
  const sitePackages = path.join(python, 'lib', 'python3.12', 'site-packages')
  const requirements = path.join(workDir, 'requirements.txt')
  run('uv', ['export', '--frozen', '--no-dev', '--no-emit-project', '--format', 'requirements-txt', '-o', requirements], { cwd: backend })
  const target = ['--python', path.join(python, 'bin', 'python3'), '--target', sitePackages, '--link-mode', 'copy']
  run('uv', ['pip', 'install', '--require-hashes', '-r', requirements, ...target], { cwd: backend })
  const wheels = path.join(workDir, 'wheel')
  run('uv', ['build', '--wheel', '-o', wheels], { cwd: backend })
  const [wheel] = readdirSync(wheels).filter((f) => f.endsWith('.whl'))
  run('uv', ['pip', 'install', '--no-deps', path.join(wheels, wheel), ...target], { cwd: backend })

  console.log('  · adding the web UI')
  cpSync(path.join(repo, 'frontend', 'dist'), path.join(stage, 'ui'), { recursive: true })

  console.log('  · smoke test')
  run(path.join(python, 'bin', 'python3'), ['-I', '-c', 'import memmon.__main__, uvicorn, fastapi; print("bundle ok", memmon.__version__)'], { cwd: workDir })

  console.log('  · packing')
  run('tar', ['--sort=name', '--owner=0', '--group=0', '--numeric-owner', '--mtime=@0', '-I', 'gzip -n -9', '-cf', outFile, '-C', stage, '.'])
  rmSync(workDir, { recursive: true, force: true })
  return { sha256: createHash('sha256').update(readFileSync(outFile)).digest('hex') }
}
