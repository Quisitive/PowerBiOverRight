import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const defaultSourceRoot = String.raw`C:\Users\CFoulon\OneDrive - Quisitive\Greg Richards's files - PBIX files\TLC_demoTactical`
const sourceRoot = process.env.POWERBI_SOURCE_ROOT ?? process.env.POWERBI_SOURCE_PATH ?? defaultSourceRoot
const csvSourcePath = path.join(sourceRoot, 'data')
const pbixFileName = process.env.POWERBI_PBIX_NAME ?? 'customer_Tactical_v1b.pbix'
const syncedPath = path.join(projectRoot, 'public', 'data')
const reportPath = path.join(syncedPath, 'pbix-validation.json')

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function readSourceFileNames(folderPath) {
  const entries = await fs.readdir(folderPath, { withFileTypes: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
}

const issues = []
const warnings = []

if (!existsSync(sourceRoot)) {
  issues.push(`Source root does not exist: ${sourceRoot}`)
}

if (!existsSync(csvSourcePath)) {
  issues.push(`CSV source path does not exist: ${csvSourcePath}`)
}

if (!existsSync(syncedPath)) {
  issues.push(`Synced data path does not exist: ${syncedPath}`)
}

let sourceCsvFiles = []
let syncedFileNames = []

if (issues.length === 0) {
  sourceCsvFiles = (await readSourceFileNames(csvSourcePath))
    .filter((name) => path.extname(name).toLowerCase() === '.csv')
    .sort((left, right) => left.localeCompare(right))
  syncedFileNames = await readSourceFileNames(syncedPath)
}

const syncedCsvFiles = syncedFileNames.filter((name) => path.extname(name).toLowerCase() === '.csv').sort((left, right) => left.localeCompare(right))

const syncedPbixNames = syncedFileNames.filter((name) => path.extname(name).toLowerCase() === '.pbix')

const sourcePbixPath = path.join(sourceRoot, pbixFileName)
const syncedPbixPath = path.join(syncedPath, pbixFileName)

const missingSyncedCsv = sourceCsvFiles.filter((fileName) => !syncedCsvFiles.includes(fileName))
const missingSourceCsv = syncedCsvFiles.filter((fileName) => !sourceCsvFiles.includes(fileName))

if (missingSyncedCsv.length > 0) {
  issues.push(`Missing synced CSV files: ${missingSyncedCsv.join(', ')}`)
}

if (missingSourceCsv.length > 0) {
  issues.push(`Unexpected synced CSV files not found in source: ${missingSourceCsv.join(', ')}`)
}

let sourcePbixHash = ''
let syncedPbixHash = ''
let hasDataMashup = false
let missingCsvNamesInMashup = []
let pbixEntryCount = 0

if (!existsSync(sourcePbixPath)) {
  issues.push(`Source PBIX file does not exist: ${sourcePbixPath}`)
}

if (!existsSync(syncedPbixPath)) {
  issues.push(`Synced PBIX file does not exist: ${syncedPbixPath}`)
}

const extraSyncedPbix = syncedPbixNames.filter((name) => name !== pbixFileName)
if (extraSyncedPbix.length > 0) {
  warnings.push(`Additional PBIX files detected in synced folder: ${extraSyncedPbix.join(', ')}`)
}

if (!issues.some((issue) => issue.includes('PBIX file does not exist'))) {
  const sourcePbixBuffer = await fs.readFile(sourcePbixPath)
  const syncedPbixBuffer = await fs.readFile(syncedPbixPath)

  sourcePbixHash = hashBuffer(sourcePbixBuffer)
  syncedPbixHash = hashBuffer(syncedPbixBuffer)

  if (sourcePbixHash !== syncedPbixHash) {
    issues.push('PBIX hash mismatch between source and synced file.')
  }

  const zip = new AdmZip(syncedPbixBuffer)
  const zipEntries = zip.getEntries().map((entry) => entry.entryName)
  pbixEntryCount = zipEntries.length
  hasDataMashup = zipEntries.includes('DataMashup')

  if (hasDataMashup) {
    const mashupBuffer = zip.readFile('DataMashup')
    const mashupText = (mashupBuffer ?? Buffer.alloc(0)).toString('latin1').toLowerCase()
    missingCsvNamesInMashup = sourceCsvFiles.filter((fileName) => !mashupText.includes(fileName.toLowerCase()))

    if (missingCsvNamesInMashup.length > 0) {
      warnings.push(`CSV names not found in DataMashup text scan: ${missingCsvNamesInMashup.join(', ')}`)
    }
  } else {
    warnings.push('PBIX package does not contain DataMashup entry; hash and file parity checks were used.')
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  status: issues.length === 0 ? 'PASSED' : 'FAILED',
  sourceRoot,
  csvSourcePath,
  pbixFileName,
  syncedPath,
  sourcePbixHash,
  syncedPbixHash,
  hasDataMashup,
  pbixEntryCount,
  sourceCsvCount: sourceCsvFiles.length,
  syncedCsvCount: syncedCsvFiles.length,
  missingSourceCsv,
  missingSyncedCsv,
  missingCsvNamesInMashup,
  warnings,
  issues,
}

await fs.mkdir(syncedPath, { recursive: true })
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

if (issues.length === 0) {
  console.log('PBIX validation passed.')
  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.log(`Warning: ${warning}`)
    }
  }
  process.exit(0)
}

console.error('PBIX validation failed.')
for (const issue of issues) {
  console.error(`- ${issue}`)
}
process.exit(1)
