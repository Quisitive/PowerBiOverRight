import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  applyFilters,
  buildMetrics,
  createDefaultFilters,
  sortRecords,
  type DashboardFilters,
  type SortDirection,
  type SortField,
} from './lib/filtering'
import {
  loadDashboardData,
  type DashboardData,
  type DashboardRecord,
  type LicenseAssignment,
} from './lib/dataService'
import { exportDashboardRecords, exportLicenseAssignments } from './lib/exportCsv'

type ViewMode = 'overview' | 'authentication' | 'licenseSignals'

interface ViewOption {
  id: ViewMode
  label: string
  description: string
}

const VIEW_OPTIONS: ViewOption[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Tenant posture at a glance',
  },
  {
    id: 'authentication',
    label: 'Authentication Registry',
    description: 'Sort by method and readiness',
  },
  {
    id: 'licenseSignals',
    label: 'License Signals',
    description: 'Track assignment drift and exceptions',
  },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return '0.0%'
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function formatEpoch(epoch: number): string {
  if (!epoch) {
    return 'N/A'
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(epoch)
}

function formatDateTime(isoText: string | undefined): string {
  if (!isoText) {
    return 'Unavailable'
  }

  const epoch = Date.parse(isoText)
  if (Number.isNaN(epoch)) {
    return 'Unavailable'
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(epoch)
}

function formatEnabledState(enabled: boolean | null): string {
  if (enabled === null) {
    return 'Unknown'
  }

  return enabled ? 'Enabled' : 'Disabled'
}

function formatSortDirection(direction: SortDirection): string {
  return direction === 'asc' ? 'Ascending' : 'Descending'
}

function sortLicenseRows(
  rows: LicenseAssignment[],
  field: 'displayName' | 'skuPartNumber' | 'assignmentType' | 'state',
  direction: SortDirection,
): LicenseAssignment[] {
  const sortedRows = [...rows].sort((left, right) => {
    if (field === 'displayName') {
      return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' })
    }

    if (field === 'skuPartNumber') {
      return left.skuPartNumber.localeCompare(right.skuPartNumber, undefined, { sensitivity: 'base' })
    }

    if (field === 'assignmentType') {
      return left.assignmentType.localeCompare(right.assignmentType, undefined, { sensitivity: 'base' })
    }

    return left.state.localeCompare(right.state, undefined, { sensitivity: 'base' })
  })

  if (direction === 'desc') {
    sortedRows.reverse()
  }

  return sortedRows
}

function App() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<ViewMode>('authentication')
  const [filters, setFilters] = useState<DashboardFilters>(createDefaultFilters)
  const [sortField, setSortField] = useState<SortField>('lastUpdated')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [pageSize, setPageSize] = useState<number>(25)
  const [page, setPage] = useState<number>(1)
  const [licenseSortField, setLicenseSortField] = useState<
    'displayName' | 'skuPartNumber' | 'assignmentType' | 'state'
  >('displayName')
  const [licenseSortDirection, setLicenseSortDirection] = useState<SortDirection>('asc')

  const records = useMemo(() => dashboardData?.records ?? [], [dashboardData])

  const loadData = async (): Promise<void> => {
    setLoading(true)
    setErrorMessage(null)

    try {
      const data = await loadDashboardData()
      setDashboardData(data)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected data load error'
      setErrorMessage(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const registrationTypeOptions = useMemo(() => {
    const registrationTypes = new Set(records.map((record) => record.registrationType))
    return ['all', ...[...registrationTypes].sort((left, right) => left.localeCompare(right))]
  }, [records])

  const userTypeOptions = useMemo(() => {
    const userTypes = new Set(records.map((record) => record.userType))
    return ['all', ...[...userTypes].sort((left, right) => left.localeCompare(right))]
  }, [records])

  const filteredRecords = useMemo(() => applyFilters(records, filters), [records, filters])

  const sortedRecords = useMemo(
    () => sortRecords(filteredRecords, sortField, sortDirection),
    [filteredRecords, sortField, sortDirection],
  )

  const metrics = useMemo(() => buildMetrics(filteredRecords), [filteredRecords])

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize))
  const currentPage = Math.min(page, totalPages)

  useEffect(() => {
    setPage(1)
  }, [filters, sortField, sortDirection, pageSize, activeView])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return sortedRecords.slice(start, end)
  }, [currentPage, pageSize, sortedRecords])

  const filteredLicenseRows = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase()
    const allRows = dashboardData?.licenses ?? []

    const rows = allRows.filter((row) => {
      if (!searchTerm) {
        return true
      }

      return `${row.displayName} ${row.userPrincipalName} ${row.skuPartNumber} ${row.assignmentType}`
        .toLowerCase()
        .includes(searchTerm)
    })

    return sortLicenseRows(rows, licenseSortField, licenseSortDirection)
  }, [dashboardData?.licenses, filters.search, licenseSortDirection, licenseSortField])

  const topSkuDistribution = useMemo(() => {
    const distribution = new Map<string, number>()
    for (const row of dashboardData?.licenses ?? []) {
      distribution.set(row.skuPartNumber, (distribution.get(row.skuPartNumber) ?? 0) + 1)
    }

    return [...distribution.entries()]
      .map(([skuPartNumber, count]) => ({ skuPartNumber, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6)
  }, [dashboardData?.licenses])

  const sourceStatusText = dashboardData?.pbixValidation?.status ?? 'NOT RUN'

  const updateFilter = <K extends keyof DashboardFilters>(
    key: K,
    value: DashboardFilters[K],
  ): void => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const resetFilters = (): void => {
    setFilters(createDefaultFilters())
    setSortField('lastUpdated')
    setSortDirection('desc')
    setPageSize(25)
    setLicenseSortField('displayName')
    setLicenseSortDirection('asc')
  }

  const exportCurrentView = (): void => {
    const dateStamp = new Date().toISOString().slice(0, 10)

    if (activeView === 'licenseSignals') {
      exportLicenseAssignments(filteredLicenseRows, `powerbioverright-license-signals-${dateStamp}.csv`)
      return
    }

    exportDashboardRecords(sortedRecords, `powerbioverright-authentication-${dateStamp}.csv`)
  }

  const renderAuthTable = (rows: DashboardRecord[]) => {
    return (
      <article className="table-card">
        <div className="table-header">
          <div>
            <h2>Authentication registry</h2>
            <p>Focused on registration type sorting and user-level authentication posture.</p>
          </div>
          <div className="table-actions">
            <label>
              Sort by
              <select
                aria-label="Sort field"
                value={sortField}
                onChange={(event) => setSortField(event.target.value as SortField)}
              >
                <option value="lastUpdated">Last updated</option>
                <option value="displayName">Display name</option>
                <option value="registrationType">Registration type</option>
                <option value="methodsCount">Methods count</option>
                <option value="mfaCapable">MFA capable</option>
                <option value="lastSignIn">Last sign-in</option>
              </select>
            </label>

            <button
              type="button"
              className="ghost-button"
              onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
            >
              {formatSortDirection(sortDirection)}
            </button>

            <label>
              Rows
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="table-scroll">
          <table aria-label="Authentication registry table">
            <thead>
              <tr>
                <th>User</th>
                <th>Registration type</th>
                <th>Methods registered</th>
                <th>MFA</th>
                <th>Passwordless</th>
                <th>SSPR</th>
                <th>Last updated</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody data-testid="auth-table-body">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    No rows match the current filter selection.
                  </td>
                </tr>
              )}

              {rows.map((row) => (
                <tr key={row.userPrincipalName}>
                  <td>
                    <div className="identity-block">
                      <span className="identity-name">{row.displayName}</span>
                      <span className="identity-subtext">{row.userPrincipalName}</span>
                      <span className="identity-subtext">
                        {row.userType} | {formatEnabledState(row.accountEnabled)}
                      </span>
                    </div>
                  </td>
                  <td>{row.registrationType}</td>
                  <td>{row.methodsRegistered.length > 0 ? row.methodsRegistered.join(', ') : 'None'}</td>
                  <td>
                    <span className={row.isMfaCapable ? 'state-pill positive' : 'state-pill negative'}>
                      {row.isMfaCapable ? 'Capable' : 'Not capable'}
                    </span>
                  </td>
                  <td>
                    <span className={row.isPasswordlessCapable ? 'state-pill positive' : 'state-pill neutral'}>
                      {row.isPasswordlessCapable ? 'Ready' : 'Not ready'}
                    </span>
                  </td>
                  <td>
                    <span className={row.isSsprRegistered ? 'state-pill positive' : 'state-pill neutral'}>
                      {row.isSsprRegistered ? 'Registered' : 'Not registered'}
                    </span>
                  </td>
                  <td>{formatEpoch(row.lastUpdatedEpoch)}</td>
                  <td>{formatEpoch(row.lastSignInEpoch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <span>
            Showing {rows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, sortedRecords.length)} of {sortedRecords.length}
          </span>
          <div className="pager">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage <= 1}>
              Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </article>
    )
  }

  const renderLicenseTable = () => {
    return (
      <article className="table-card">
        <div className="table-header">
          <div>
            <h2>License assignment signals</h2>
            <p>Track assignment source and state to identify registration and entitlement drift.</p>
          </div>
          <div className="table-actions">
            <label>
              Sort by
              <select
                aria-label="License sort field"
                value={licenseSortField}
                onChange={(event) =>
                  setLicenseSortField(
                    event.target.value as 'displayName' | 'skuPartNumber' | 'assignmentType' | 'state',
                  )
                }
              >
                <option value="displayName">Display name</option>
                <option value="skuPartNumber">SKU</option>
                <option value="assignmentType">Assignment type</option>
                <option value="state">State</option>
              </select>
            </label>
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                setLicenseSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
              }
            >
              {formatSortDirection(licenseSortDirection)}
            </button>
          </div>
        </div>

        <div className="table-scroll">
          <table aria-label="License assignment table">
            <thead>
              <tr>
                <th>User</th>
                <th>SKU</th>
                <th>Assignment type</th>
                <th>State</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody data-testid="license-table-body">
              {filteredLicenseRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    No license rows match the current search.
                  </td>
                </tr>
              )}

              {filteredLicenseRows.map((row) => (
                <tr key={`${row.userPrincipalName}-${row.skuPartNumber}-${row.assignmentType}`}>
                  <td>
                    <div className="identity-block">
                      <span className="identity-name">{row.displayName}</span>
                      <span className="identity-subtext">{row.userPrincipalName}</span>
                    </div>
                  </td>
                  <td>{row.skuPartNumber}</td>
                  <td>{row.assignmentType}</td>
                  <td>
                    <span className={row.state.toLowerCase() === 'active' ? 'state-pill positive' : 'state-pill neutral'}>
                      {row.state}
                    </span>
                  </td>
                  <td>{row.error || 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    )
  }

  return (
    <div className="app-shell">
      <header className="hero-panel">
        <div className="hero-copy">
          <p className="kicker">PowerBiOverRight</p>
          <h1>Modern identity analytics without Power BI friction</h1>
          <p>
            Customer-ready analytics optimized for authentication sorting, registration type visibility,
            and role-based deployment operations.
          </p>
        </div>

        <nav className="view-menu" aria-label="Dashboard sections">
          {VIEW_OPTIONS.map((view) => (
            <button
              key={view.id}
              type="button"
              aria-pressed={activeView === view.id}
              onClick={() => setActiveView(view.id)}
            >
              <span>{view.label}</span>
              <small>{view.description}</small>
            </button>
          ))}
        </nav>
      </header>

      <section className="control-panel">
        <div className="control-grid">
          <label>
            Search users or SKUs
            <input
              aria-label="Search"
              placeholder="Search by name, UPN, department, or SKU"
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
            />
          </label>

          <label>
            Registration type
            <select
              aria-label="Registration type"
              value={filters.registrationType}
              onChange={(event) => updateFilter('registrationType', event.target.value)}
            >
              {registrationTypeOptions.map((registrationType) => (
                <option key={registrationType} value={registrationType}>
                  {registrationType === 'all' ? 'All registration types' : registrationType}
                </option>
              ))}
            </select>
          </label>

          <label>
            MFA capability
            <select
              aria-label="MFA capability"
              value={filters.mfaCapability}
              onChange={(event) =>
                updateFilter('mfaCapability', event.target.value as DashboardFilters['mfaCapability'])
              }
            >
              <option value="all">All users</option>
              <option value="capable">MFA capable only</option>
              <option value="notCapable">Not MFA capable</option>
            </select>
          </label>

          <label>
            SSPR status
            <select
              aria-label="SSPR status"
              value={filters.ssprStatus}
              onChange={(event) =>
                updateFilter('ssprStatus', event.target.value as DashboardFilters['ssprStatus'])
              }
            >
              <option value="all">All users</option>
              <option value="registered">Registered</option>
              <option value="notRegistered">Not registered</option>
            </select>
          </label>

          <label>
            User type
            <select
              aria-label="User type"
              value={filters.userType}
              onChange={(event) => updateFilter('userType', event.target.value)}
            >
              {userTypeOptions.map((userType) => (
                <option key={userType} value={userType}>
                  {userType === 'all' ? 'All user types' : userType}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="action-cluster">
          <button type="button" onClick={() => void loadData()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh data'}
          </button>
          <button type="button" onClick={resetFilters}>
            Reset filters
          </button>
          <button type="button" className="accent" onClick={exportCurrentView}>
            Export current view
          </button>
        </div>
      </section>

      {errorMessage && !dashboardData && (
        <section className="message-card" role="alert">
          <h2>Data load failed</h2>
          <p>{errorMessage}</p>
          <button type="button" onClick={() => void loadData()}>
            Retry
          </button>
        </section>
      )}

      {dashboardData && (
        <>
          {errorMessage && (
            <section className="message-card warning" role="alert">
              <h2>Refresh warning</h2>
              <p>{errorMessage}</p>
            </section>
          )}

          <section className="metric-grid" aria-label="Key metrics">
            <article>
              <h3>Total in view</h3>
              <p>{metrics.total}</p>
            </article>
            <article>
              <h3>MFA capable</h3>
              <p>{formatPercent(metrics.mfaCapableCount, metrics.total)}</p>
            </article>
            <article>
              <h3>Passwordless capable</h3>
              <p>{formatPercent(metrics.passwordlessCount, metrics.total)}</p>
            </article>
            <article>
              <h3>SSPR registered</h3>
              <p>{formatPercent(metrics.ssprRegisteredCount, metrics.total)}</p>
            </article>
          </section>

          <section className="workspace-grid">
            {activeView === 'licenseSignals' ? renderLicenseTable() : renderAuthTable(pagedRecords)}

            <aside className="insight-panel">
              <section>
                <h3>PBIX source validation</h3>
                <div className="status-row">
                  <span>Status</span>
                  <strong
                    className={
                      sourceStatusText === 'PASSED'
                        ? 'badge success'
                        : sourceStatusText === 'FAILED'
                          ? 'badge warning'
                          : 'badge neutral'
                    }
                  >
                    {sourceStatusText}
                  </strong>
                </div>
                <div className="status-row">
                  <span>Manifest synced</span>
                  <strong>{formatDateTime(dashboardData.sourceManifest?.copiedAt)}</strong>
                </div>
                <div className="status-row">
                  <span>Last validation</span>
                  <strong>{formatDateTime(dashboardData.pbixValidation?.checkedAt)}</strong>
                </div>
                <div className="status-row">
                  <span>PBIX entries</span>
                  <strong>{dashboardData.pbixValidation?.pbixEntryCount ?? 'Unknown'}</strong>
                </div>
                {dashboardData.pbixValidation?.warnings?.length ? (
                  <ul className="warning-list">
                    {dashboardData.pbixValidation.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                {dashboardData.pbixValidation?.issues?.length ? (
                  <ul className="issue-list">
                    {dashboardData.pbixValidation.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section>
                <h3>Registration type mix</h3>
                <div className="mix-list">
                  {metrics.registrationTypes.slice(0, 6).map((item) => (
                    <div key={item.name} className="mix-row">
                      <div className="mix-label-row">
                        <span>{item.name}</span>
                        <strong>{item.count}</strong>
                      </div>
                      <div className="mix-track">
                        <span style={{ width: `${item.percentage.toFixed(1)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3>Top license SKUs</h3>
                <div className="sku-list">
                  {topSkuDistribution.map((item) => (
                    <div key={item.skuPartNumber} className="status-row">
                      <span>{item.skuPartNumber}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        </>
      )}
    </div>
  )
}

export default App
