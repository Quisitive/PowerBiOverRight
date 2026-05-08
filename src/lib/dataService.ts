import Papa from 'papaparse'

const DATA_ROOT = '/data'
const MFA_FILE = 'EntraMFAregistrations.csv'
const USERS_FILE = 'EntraUsers.csv'
const LICENSE_FILE = 'EntraLicenseAssignments-v2.csv'
const SOURCE_MANIFEST_FILE = 'source-manifest.json'
const PBIX_VALIDATION_FILE = 'pbix-validation.json'

interface MfaCsvRow {
  userPrincipalName: string
  userDisplayName: string
  isMfaCapable: string
  isPasswordlessCapable: string
  isSsprRegistered: string
  isSsprEnabled: string
  userPreferredMethodForSecondaryAuthentication: string
  methodsRegistered: string
  lastUpdatedDateTime: string
}

interface UserCsvRow {
  userPrincipalName: string
  displayName: string
  userType: string
  department: string
  jobTitle: string
  usageLocation: string
  accountEnabled: string
  signInActivity: string
}

interface LicenseCsvRow {
  UserPrincipalName: string
  DisplayName: string
  SkuPartNumber: string
  AssignmentType: string
  State: string
  Error: string
}

export interface SourceManifestEntry {
  name: string
  size: number
  modifiedUtc: string
}

export interface SourceManifestFile {
  copiedAt: string
  sourcePath: string
  files: SourceManifestEntry[]
}

export interface PbixValidationReport {
  checkedAt: string
  status: 'PASSED' | 'FAILED'
  issues: string[]
  warnings?: string[]
  missingSourceCsv: string[]
  missingSyncedCsv: string[]
  missingCsvNamesInMashup: string[]
  sourcePbixHash: string
  syncedPbixHash: string
  pbixEntryCount?: number
}

export interface DashboardRecord {
  userPrincipalName: string
  displayName: string
  registrationType: string
  preferredMethod: string
  methodsRegistered: string[]
  methodsCount: number
  isMfaCapable: boolean
  isPasswordlessCapable: boolean
  isSsprRegistered: boolean
  isSsprEnabled: boolean
  lastUpdatedEpoch: number
  lastSignInEpoch: number
  userType: string
  department: string
  jobTitle: string
  usageLocation: string
  accountEnabled: boolean | null
}

export interface LicenseAssignment {
  userPrincipalName: string
  displayName: string
  skuPartNumber: string
  assignmentType: string
  state: string
  error: string
}

export interface DashboardData {
  records: DashboardRecord[]
  licenses: LicenseAssignment[]
  sourceManifest?: SourceManifestFile
  pbixValidation?: PbixValidationReport
  loadedAt: string
}

const METHOD_LABELS: Record<string, string> = {
  microsoftauthenticatorpush: 'Authenticator Push',
  softwareonetimepasscode: 'Authenticator Code',
  fido2securitykey: 'FIDO2 Security Key',
  windowshelloforbusiness: 'Windows Hello for Business',
  sms: 'SMS',
  voice: 'Voice Call',
  email: 'Email OTP',
  temporaryaccesspass: 'Temporary Access Pass',
}

function cleanText(value: string | undefined): string {
  return (value ?? '').trim()
}

function normalizePrincipalName(value: string | undefined): string {
  return cleanText(value).toLowerCase()
}

function parseBoolean(value: string | undefined): boolean {
  return cleanText(value).toLowerCase() === 'true'
}

function parseEpoch(value: string | undefined): number {
  const trimmed = cleanText(value)
  if (!trimmed) {
    return 0
  }

  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? 0 : parsed
}

function normalizeMethodToken(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function formatMethodLabel(value: string): string {
  const trimmed = cleanText(value)
  if (!trimmed) {
    return 'None'
  }

  const methodKey = normalizeMethodToken(trimmed)
  if (METHOD_LABELS[methodKey]) {
    return METHOD_LABELS[methodKey]
  }

  return trimmed
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMethods(rawValue: string | undefined): string[] {
  const trimmed = cleanText(rawValue)
  if (!trimmed) {
    return []
  }

  return trimmed
    .split(';')
    .map((item) => formatMethodLabel(item))
    .filter((item) => item.length > 0)
}

function deriveRegistrationType(preferredMethod: string | undefined, methods: string[]): string {
  const preferred = formatMethodLabel(preferredMethod ?? '')
  if (preferred !== 'None') {
    return preferred
  }

  const normalizedMethods = methods.map((method) => normalizeMethodToken(method))

  if (normalizedMethods.some((method) => method.includes('fido2') || method.includes('windowshello'))) {
    return 'Passwordless'
  }

  if (normalizedMethods.some((method) => method.includes('microsoftauthenticatorpush'))) {
    return 'Authenticator Push'
  }

  if (normalizedMethods.some((method) => method.includes('softwareonetimepasscode'))) {
    return 'Authenticator Code'
  }

  if (normalizedMethods.some((method) => method.includes('email'))) {
    return 'Email OTP'
  }

  if (normalizedMethods.some((method) => method.includes('sms') || method.includes('voice') || method.includes('phone'))) {
    return 'SMS / Voice'
  }

  return 'None'
}

interface SignInActivityPayload {
  LastSuccessfulSignInDateTime?: string
  LastSignInDateTime?: string
}

function parseLastSignInEpoch(rawSignInActivity: string | undefined): number {
  const signInActivity = cleanText(rawSignInActivity)
  if (!signInActivity) {
    return 0
  }

  try {
    const parsedPayload = JSON.parse(signInActivity) as SignInActivityPayload
    const candidate = cleanText(parsedPayload.LastSuccessfulSignInDateTime) || cleanText(parsedPayload.LastSignInDateTime)
    return parseEpoch(candidate)
  } catch {
    return 0
  }
}

function hasAnyValue(row: Record<string, unknown>): boolean {
  return Object.values(row).some((value) => cleanText(String(value ?? '')) !== '')
}

async function loadCsvFile<T extends object>(fileName: string): Promise<T[]> {
  const response = await fetch(`${DATA_ROOT}/${fileName}`)
  if (!response.ok) {
    throw new Error(`Unable to load ${fileName} (${response.status})`)
  }

  const csvText = await response.text()
  const parsed = Papa.parse<T>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  })

  const parsingErrors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter')
  if (parsingErrors.length > 0) {
    const firstError = parsingErrors[0]
    throw new Error(`CSV parse error in ${fileName} at row ${firstError.row}: ${firstError.message}`)
  }

  return parsed.data.filter((row) => hasAnyValue(row as Record<string, unknown>))
}

async function loadJsonFile<T>(fileName: string): Promise<T | undefined> {
  const response = await fetch(`${DATA_ROOT}/${fileName}`)
  if (!response.ok) {
    return undefined
  }

  try {
    const parsed = (await response.json()) as T
    return parsed
  } catch {
    return undefined
  }
}

function buildUserMap(users: UserCsvRow[]): Map<string, UserCsvRow> {
  const userMap = new Map<string, UserCsvRow>()

  for (const user of users) {
    const principalName = normalizePrincipalName(user.userPrincipalName)
    if (!principalName) {
      continue
    }

    userMap.set(principalName, user)
  }

  return userMap
}

function mapLicenseRows(licenseRows: LicenseCsvRow[]): LicenseAssignment[] {
  return licenseRows
    .map((row) => ({
      userPrincipalName: cleanText(row.UserPrincipalName),
      displayName: cleanText(row.DisplayName),
      skuPartNumber: cleanText(row.SkuPartNumber),
      assignmentType: cleanText(row.AssignmentType),
      state: cleanText(row.State),
      error: cleanText(row.Error),
    }))
    .filter((row) => row.userPrincipalName !== '')
}

export async function loadDashboardData(): Promise<DashboardData> {
  const [mfaRows, userRows, licenseRows, sourceManifest, pbixValidation] = await Promise.all([
    loadCsvFile<MfaCsvRow>(MFA_FILE),
    loadCsvFile<UserCsvRow>(USERS_FILE),
    loadCsvFile<LicenseCsvRow>(LICENSE_FILE),
    loadJsonFile<SourceManifestFile>(SOURCE_MANIFEST_FILE),
    loadJsonFile<PbixValidationReport>(PBIX_VALIDATION_FILE),
  ])

  const usersByPrincipalName = buildUserMap(userRows)

  const records = mfaRows
    .map((mfaRow) => {
      const principalName = cleanText(mfaRow.userPrincipalName)
      const principalLookupKey = normalizePrincipalName(principalName)
      const userRow = usersByPrincipalName.get(principalLookupKey)
      const methodsRegistered = parseMethods(mfaRow.methodsRegistered)
      const preferredMethod = formatMethodLabel(mfaRow.userPreferredMethodForSecondaryAuthentication)
      const registrationType = deriveRegistrationType(mfaRow.userPreferredMethodForSecondaryAuthentication, methodsRegistered)

      const accountEnabledText = cleanText(userRow?.accountEnabled)
      const accountEnabled = accountEnabledText === '' ? null : parseBoolean(accountEnabledText)

      return {
        userPrincipalName: principalName,
        displayName: cleanText(mfaRow.userDisplayName) || cleanText(userRow?.displayName) || principalName,
        registrationType,
        preferredMethod,
        methodsRegistered,
        methodsCount: methodsRegistered.length,
        isMfaCapable: parseBoolean(mfaRow.isMfaCapable),
        isPasswordlessCapable: parseBoolean(mfaRow.isPasswordlessCapable),
        isSsprRegistered: parseBoolean(mfaRow.isSsprRegistered),
        isSsprEnabled: parseBoolean(mfaRow.isSsprEnabled),
        lastUpdatedEpoch: parseEpoch(mfaRow.lastUpdatedDateTime),
        lastSignInEpoch: parseLastSignInEpoch(userRow?.signInActivity),
        userType: cleanText(userRow?.userType) || 'Unknown',
        department: cleanText(userRow?.department) || 'Unassigned',
        jobTitle: cleanText(userRow?.jobTitle) || 'N/A',
        usageLocation: cleanText(userRow?.usageLocation) || 'N/A',
        accountEnabled,
      }
    })
    .filter((record) => record.userPrincipalName !== '')

  return {
    records,
    licenses: mapLicenseRows(licenseRows),
    sourceManifest,
    pbixValidation,
    loadedAt: new Date().toISOString(),
  }
}
