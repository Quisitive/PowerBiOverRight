import type { DashboardRecord, LicenseAssignment } from './dataService'

function escapeCsvValue(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

function triggerFileDownload(content: string, fileName: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const csvBlob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const csvUrl = URL.createObjectURL(csvBlob)
  const anchor = document.createElement('a')
  anchor.href = csvUrl
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(csvUrl)
}

export function exportDashboardRecords(records: DashboardRecord[], fileName: string): void {
  const headers = [
    'DisplayName',
    'UserPrincipalName',
    'RegistrationType',
    'PreferredMethod',
    'MethodsRegistered',
    'MfaCapable',
    'PasswordlessCapable',
    'SsprRegistered',
    'UserType',
    'Department',
    'JobTitle',
  ]

  const rows = records.map((record) => {
    return [
      record.displayName,
      record.userPrincipalName,
      record.registrationType,
      record.preferredMethod,
      record.methodsRegistered.join('; '),
      String(record.isMfaCapable),
      String(record.isPasswordlessCapable),
      String(record.isSsprRegistered),
      record.userType,
      record.department,
      record.jobTitle,
    ]
      .map((value) => escapeCsvValue(value))
      .join(',')
  })

  triggerFileDownload([headers.join(','), ...rows].join('\n'), fileName)
}

export function exportLicenseAssignments(licenses: LicenseAssignment[], fileName: string): void {
  const headers = ['DisplayName', 'UserPrincipalName', 'SkuPartNumber', 'AssignmentType', 'State', 'Error']

  const rows = licenses.map((license) => {
    return [
      license.displayName,
      license.userPrincipalName,
      license.skuPartNumber,
      license.assignmentType,
      license.state,
      license.error,
    ]
      .map((value) => escapeCsvValue(value))
      .join(',')
  })

  triggerFileDownload([headers.join(','), ...rows].join('\n'), fileName)
}
