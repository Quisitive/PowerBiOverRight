import type { DashboardRecord } from './dataService'

export type SortField =
  | 'displayName'
  | 'registrationType'
  | 'lastUpdated'
  | 'methodsCount'
  | 'mfaCapable'
  | 'lastSignIn'

export type SortDirection = 'asc' | 'desc'

export interface DashboardFilters {
  search: string
  registrationType: string
  mfaCapability: 'all' | 'capable' | 'notCapable'
  ssprStatus: 'all' | 'registered' | 'notRegistered'
  userType: string
}

export interface RegistrationTypeMetric {
  name: string
  count: number
  percentage: number
}

export interface DashboardMetrics {
  total: number
  mfaCapableCount: number
  passwordlessCount: number
  ssprRegisteredCount: number
  registrationTypes: RegistrationTypeMetric[]
}

export function createDefaultFilters(): DashboardFilters {
  return {
    search: '',
    registrationType: 'all',
    mfaCapability: 'all',
    ssprStatus: 'all',
    userType: 'all',
  }
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

function compareNumber(left: number, right: number): number {
  if (left === right) {
    return 0
  }

  return left < right ? -1 : 1
}

export function applyFilters(records: DashboardRecord[], filters: DashboardFilters): DashboardRecord[] {
  const searchTerm = filters.search.trim().toLowerCase()

  return records.filter((record) => {
    if (searchTerm) {
      const haystack = `${record.displayName} ${record.userPrincipalName} ${record.jobTitle} ${record.department}`.toLowerCase()
      if (!haystack.includes(searchTerm)) {
        return false
      }
    }

    if (filters.registrationType !== 'all' && record.registrationType !== filters.registrationType) {
      return false
    }

    if (filters.userType !== 'all' && record.userType !== filters.userType) {
      return false
    }

    if (filters.mfaCapability === 'capable' && !record.isMfaCapable) {
      return false
    }

    if (filters.mfaCapability === 'notCapable' && record.isMfaCapable) {
      return false
    }

    if (filters.ssprStatus === 'registered' && !record.isSsprRegistered) {
      return false
    }

    if (filters.ssprStatus === 'notRegistered' && record.isSsprRegistered) {
      return false
    }

    return true
  })
}

export function sortRecords(records: DashboardRecord[], field: SortField, direction: SortDirection): DashboardRecord[] {
  const sortedRecords = [...records].sort((left, right) => {
    switch (field) {
      case 'displayName':
        return compareText(left.displayName, right.displayName)
      case 'registrationType':
        return compareText(left.registrationType, right.registrationType)
      case 'lastUpdated':
        return compareNumber(left.lastUpdatedEpoch, right.lastUpdatedEpoch)
      case 'methodsCount':
        return compareNumber(left.methodsCount, right.methodsCount)
      case 'mfaCapable':
        return compareNumber(Number(left.isMfaCapable), Number(right.isMfaCapable))
      case 'lastSignIn':
        return compareNumber(left.lastSignInEpoch, right.lastSignInEpoch)
      default:
        return 0
    }
  })

  if (direction === 'desc') {
    sortedRecords.reverse()
  }

  return sortedRecords
}

export function buildMetrics(records: DashboardRecord[]): DashboardMetrics {
  const total = records.length
  const mfaCapableCount = records.filter((record) => record.isMfaCapable).length
  const passwordlessCount = records.filter((record) => record.isPasswordlessCapable).length
  const ssprRegisteredCount = records.filter((record) => record.isSsprRegistered).length

  const registrationTypeMap = new Map<string, number>()
  for (const record of records) {
    registrationTypeMap.set(record.registrationType, (registrationTypeMap.get(record.registrationType) ?? 0) + 1)
  }

  const registrationTypes = [...registrationTypeMap.entries()]
    .map(([name, count]) => ({
      name,
      count,
      percentage: total === 0 ? 0 : (count / total) * 100,
    }))
    .sort((left, right) => right.count - left.count)

  return {
    total,
    mfaCapableCount,
    passwordlessCount,
    ssprRegisteredCount,
    registrationTypes,
  }
}
