import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { loadDashboardData, type DashboardData } from './lib/dataService'

vi.mock('./lib/dataService', async () => {
  const actual = await vi.importActual<typeof import('./lib/dataService')>('./lib/dataService')
  return {
    ...actual,
    loadDashboardData: vi.fn(),
  }
})

const sampleData: DashboardData = {
  records: [
    {
      userPrincipalName: 'alice@example.com',
      displayName: 'Alice User',
      registrationType: 'Authenticator Push',
      preferredMethod: 'Authenticator Push',
      methodsRegistered: ['Authenticator Push', 'Authenticator Code'],
      methodsCount: 2,
      isMfaCapable: true,
      isPasswordlessCapable: true,
      isSsprRegistered: true,
      isSsprEnabled: true,
      lastUpdatedEpoch: Date.parse('2026-04-03T12:00:00Z'),
      lastSignInEpoch: Date.parse('2026-04-04T08:00:00Z'),
      userType: 'Member',
      department: 'Security',
      jobTitle: 'Analyst',
      usageLocation: 'US',
      accountEnabled: true,
    },
    {
      userPrincipalName: 'bob@example.com',
      displayName: 'Bob User',
      registrationType: 'None',
      preferredMethod: 'None',
      methodsRegistered: [],
      methodsCount: 0,
      isMfaCapable: false,
      isPasswordlessCapable: false,
      isSsprRegistered: false,
      isSsprEnabled: false,
      lastUpdatedEpoch: Date.parse('2026-04-02T12:00:00Z'),
      lastSignInEpoch: Date.parse('2026-04-01T08:00:00Z'),
      userType: 'Guest',
      department: 'External',
      jobTitle: 'Partner',
      usageLocation: 'US',
      accountEnabled: true,
    },
    {
      userPrincipalName: 'carol@example.com',
      displayName: 'Carol User',
      registrationType: 'SMS / Voice',
      preferredMethod: 'SMS / Voice',
      methodsRegistered: ['SMS'],
      methodsCount: 1,
      isMfaCapable: true,
      isPasswordlessCapable: false,
      isSsprRegistered: true,
      isSsprEnabled: true,
      lastUpdatedEpoch: Date.parse('2026-04-01T12:00:00Z'),
      lastSignInEpoch: Date.parse('2026-04-02T08:00:00Z'),
      userType: 'Member',
      department: 'IT',
      jobTitle: 'Support',
      usageLocation: 'US',
      accountEnabled: true,
    },
  ],
  licenses: [
    {
      userPrincipalName: 'alice@example.com',
      displayName: 'Alice User',
      skuPartNumber: 'DEVELOPERPACK_E5',
      assignmentType: 'InheritedFromGroup',
      state: 'Active',
      error: 'None',
    },
    {
      userPrincipalName: 'bob@example.com',
      displayName: 'Bob User',
      skuPartNumber: 'FLOW_FREE',
      assignmentType: 'Direct',
      state: 'Active',
      error: 'None',
    },
  ],
  sourceManifest: {
    copiedAt: '2026-05-08T18:30:00.000Z',
    sourcePath: 'C:/source',
    files: [],
  },
  pbixValidation: {
    checkedAt: '2026-05-08T18:31:00.000Z',
    status: 'PASSED',
    issues: [],
    missingSourceCsv: [],
    missingSyncedCsv: [],
    missingCsvNamesInMashup: [],
    sourcePbixHash: 'source',
    syncedPbixHash: 'synced',
  },
  loadedAt: '2026-05-08T18:31:30.000Z',
}

const mockedLoadDashboardData = vi.mocked(loadDashboardData)

describe('PowerBiOverRight dashboard', () => {
  beforeEach(() => {
    mockedLoadDashboardData.mockResolvedValue(sampleData)
  })

  it('switches between authentication and license menu views', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('table', { name: 'Authentication registry table' })
    await user.click(screen.getByRole('button', { name: /License Signals/i }))

    expect(screen.getByRole('table', { name: 'License assignment table' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Authentication registry table' })).not.toBeInTheDocument()
  })

  it('filters by search and resets all controls', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('table', { name: 'Authentication registry table' })

    const search = screen.getByLabelText('Search')
    await user.type(search, 'alice')

    expect(screen.getByText('Alice User')).toBeInTheDocument()
    expect(screen.queryByText('Bob User')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset filters' }))

    expect(search).toHaveValue('')
    expect(screen.getByText('Bob User')).toBeInTheDocument()
  })

  it('changes sort direction from descending to ascending', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('table', { name: 'Authentication registry table' })

    await user.selectOptions(screen.getByLabelText('Sort field'), 'displayName')

    const body = screen.getByTestId('auth-table-body')
    let rows = within(body).getAllByRole('row')
    expect(rows[0]).toHaveTextContent('Carol User')

    await user.click(screen.getByRole('button', { name: 'Descending' }))

    rows = within(body).getAllByRole('row')
    expect(rows[0]).toHaveTextContent('Alice User')
  })
})
