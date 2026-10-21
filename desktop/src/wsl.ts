/** Finding a usable WSL 2 distro from `wsl.exe --list --verbose`. */

export interface Distro {
  name: string
  isDefault: boolean
  version: number
}

export class WslError extends Error {}

export const DISTRO_NAME = /^[A-Za-z0-9._-]{1,64}$/
const ROW = /^(\*?)\s*(\S+)\s+\S+\s+(\d+)$/

/** wsl.exe writes UTF-16LE unless WSL_UTF8=1 is set; accept either. */
export function decodeWslOutput(buf: Buffer): string {
  const utf16 = buf.length >= 2 && (buf.includes(0) || (buf[0] === 0xff && buf[1] === 0xfe))
  const text = utf16 ? buf.toString('utf16le') : buf.toString('utf8')
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
}

export function parseDistroList(text: string): Distro[] {
  const distros: Distro[] = []
  for (const line of text.split('\n')) {
    const match = ROW.exec(line.trim())
    if (!match) continue
    const [, star, name, version] = match
    if (!name || !DISTRO_NAME.test(name)) continue
    distros.push({ name, isDefault: star === '*', version: Number(version) })
  }
  return distros
}

const isUsable = (d: Distro) => d.version === 2 && !d.name.startsWith('docker-desktop')

/** The preferred distro if given, else the default WSL 2 distro, else the first usable one. */
export function chooseDistro(distros: Distro[], preferred?: string): string {
  if (preferred !== undefined) {
    const found = distros.find((d) => d.name === preferred)
    if (!found) throw new WslError(`WSL distro "${preferred}" is not installed`)
    if (found.version !== 2) throw new WslError(`WSL distro "${preferred}" must use WSL 2 (wsl --set-version ${preferred} 2)`)
    return found.name
  }
  const chosen = distros.find((d) => d.isDefault && isUsable(d)) ?? distros.find(isUsable)
  if (!chosen) {
    throw new WslError('Memory Monitor needs WSL 2 with a Linux distribution. Install one with: wsl --install')
  }
  return chosen.name
}
