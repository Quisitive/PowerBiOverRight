import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const defaultSourceRoot = String.raw`C:\Users\CFoulon\OneDrive - Quisitive\Greg Richards's files - PBIX files\TLC_demoTactical`
const sourceRoot = process.env.POWERBI_SOURCE_ROOT ?? process.env.POWERBI_SOURCE_PATH ?? defaultSourceRoot
const csvSourcePath = path.join(sourceRoot, 'data')
const pbixFileName = process.env.POWERBI_PBIX_NAME ?? 'customer_Tactical_v1b.pbix'
const sourcePbixPath = path.join(sourceRoot, pbixFileName)
const targetPath = path.join(projectRoot, 'public', 'data')

if (!existsSync(sourceRoot)) {
  throw new Error(`Source folder not found: ${sourceRoot}`)
}

if (!existsSync(csvSourcePath)) {
  throw new Error(`CSV source folder not found: ${csvSourcePath}`)
}

if (!existsSync(sourcePbixPath)) {
  throw new Error(`PBIX file not found: ${sourcePbixPath}`)
}

await fs.mkdir(targetPath, { recursive: true })

const existingTargetEntries = await fs.readdir(targetPath, { withFileTypes: true })
for (const entry of existingTargetEntries) {
  if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.pbix') {
    await fs.rm(path.join(targetPath, entry.name), { force: true })
  }
}

const sourceEntries = await fs.readdir(csvSourcePath, { withFileTypes: true })
const csvFiles = sourceEntries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => path.extname(name).toLowerCase() === '.csv')
  .sort((left, right) => left.localeCompare(right))

if (csvFiles.length === 0) {
  throw new Error(`No .csv files found in ${csvSourcePath}`)
}

const copiedFiles = []

for (const fileName of csvFiles) {
  const sourceFilePath = path.join(csvSourcePath, fileName)
  const targetFilePath = path.join(targetPath, fileName)
  await fs.copyFile(sourceFilePath, targetFilePath)

  const fileStat = await fs.stat(targetFilePath)
  copiedFiles.push({
    name: fileName,
    size: fileStat.size,
    modifiedUtc: fileStat.mtime.toISOString(),
    source: 'csv',
  })
}

const targetPbixPath = path.join(targetPath, pbixFileName)
await fs.copyFile(sourcePbixPath, targetPbixPath)

const pbixStat = await fs.stat(targetPbixPath)
copiedFiles.push({
  name: pbixFileName,
  size: pbixStat.size,
  modifiedUtc: pbixStat.mtime.toISOString(),
  source: 'pbix',
})

const manifest = {
  copiedAt: new Date().toISOString(),
  sourceRoot,
  csvSourcePath,
  pbixFileName,
  files: copiedFiles,
}

await fs.writeFile(path.join(targetPath, 'source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`Synced ${copiedFiles.length} files from ${sourceRoot}`)
