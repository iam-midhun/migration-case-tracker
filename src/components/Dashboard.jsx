
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard,
  FolderOpen,
  Bookmark,
  Trash2,
  Settings,
  Search,
  Plus,
  Sun,
  Moon,
  LogOut,
  RefreshCw,
  ShieldCheck,
  RotateCcw,
  Download
} from 'lucide-react'
import AddCaseModal from './AddCaseModal'
import ImportCasesModal from './ImportCasesModal'
import CaseDetails from './CaseDetails'
import BackupRestore from './BackupRestore'

function parseCSVDate(value) {
  if (!value?.trim()) return null

  const text = value.trim()

  let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)

  if (match) {
    const [, day, month, year] = match

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    ).toISOString()
  }

  match = text.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)

  if (match) {
    return new Date(`${text} 12:00:00`).toISOString()
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (match) {
    const [, year, month, day] = match

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    ).toISOString()
  }

  return null
}

function Dashboard({ user, onLogout, theme, onToggleTheme }) {
  const [cases, setCases] = useState([])
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeView, setActiveView] = useState('all')
  const [showAddCase, setShowAddCase] = useState(false)
  const [showImportCases, setShowImportCases] = useState(false)
  const [selectedCase, setSelectedCase] = useState(null)
  const [restoringCaseId, setRestoringCaseId] = useState(null)
  const [deletingCaseId, setDeletingCaseId] = useState(null)

  const [currentPage, setCurrentPage] = useState(1)
  const casesPerPage = 10

  async function loadDashboard() {
    setLoading(true)
    setError('')

    const [casesResult, statusesResult] = await Promise.all([
      supabase
        .from('cases')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('case_statuses')
        .select('status_key, status_name')
        .order('status_key')
    ])

    if (casesResult.error) {
      setError(casesResult.error.message)
    } else {
      setCases(casesResult.data || [])
    }

    if (statusesResult.error) {
      setError(statusesResult.error.message)
    } else {
      setStatuses(statusesResult.data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeView, search])

  const statusMap = useMemo(() => {
    return Object.fromEntries(
      statuses.map(status => [
        status.status_key,
        status.status_name
      ])
    )
  }, [statuses])

  const activeCases = useMemo(
    () => cases.filter(item => !item.deleted_at),
    [cases]
  )

  const deletedCases = useMemo(
    () => cases.filter(item => item.deleted_at),
    [cases]
  )

  const filteredCases = useMemo(() => {
    const term = search.toLowerCase().trim()

    let sourceCases = activeCases

    if (activeView === 'bookmarks') {
      sourceCases = activeCases.filter(item => item.is_bookmarked)
    }

    if (activeView === 'recycle') {
      sourceCases = deletedCases
    }

    return sourceCases.filter(item => {
      if (!term) return true

      return [
        item.case_id,
        item.source_product,
        item.destination_product,
        statusMap[item.current_status_key]
      ]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(term))
    })
  }, [activeCases, deletedCases, search, statusMap, activeView])

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCases.length / casesPerPage)
  )

  const safePage = Math.min(currentPage, totalPages)

  const startIndex = (safePage - 1) * casesPerPage
  const endIndex = startIndex + casesPerPage

  const paginatedCases = filteredCases.slice(
    startIndex,
    endIndex
  )

  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  )

  const completed = activeCases.filter(
    item =>
      statusMap[item.current_status_key]?.toLowerCase() ===
      'migration completed'
  ).length

  const inProgress = activeCases.filter(
    item =>
      statusMap[item.current_status_key]?.toLowerCase() ===
      'migration in progress'
  ).length

  const pending = activeCases.filter(item => {
    const statusName = statusMap[item.current_status_key]?.toLowerCase()

    return (
      statusName !== 'migration completed' &&
      statusName !== 'migration in progress' &&
      statusName !== 'cancelled'
    )
  }).length

  function formatDate(value) {
    if (!value) return '—'

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    }).format(new Date(value))
  }

  function handleExportCSV() {
    const headers = [
      'Case ID',
      'Source Product',
      'Destination Product',
      'Received Date',
      'Status',
      'Status Key',
      'Notes',
      'Bookmarked',
      'Created At',
      'Completion Date'
    ]

    const escapeCSV = value => {
      const text = String(value ?? '')
      return `"${text.replace(/"/g, '""')}"`
    }

    const rows = activeCases.map(item => [
      item.case_id,
      item.source_product,
      item.destination_product,
      item.received_at
        ? formatDate(item.received_at)
        : '',
      statusMap[item.current_status_key] || '',
      item.current_status_key,
      item.notes,
      item.is_bookmarked ? 'Yes' : 'No',
      item.created_at,
      item.completed_at
        ? formatDate(item.completed_at)
        : ''
    ])

    const csvContent = [
      headers,
      ...rows
    ]
      .map(row => row.map(escapeCSV).join(','))
      .join('\r\n')

    const blob = new Blob(
      ['\uFEFF' + csvContent],
      { type: 'text/csv;charset=utf-8;' }
    )

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `migration-cases-${new Date().toISOString().slice(0, 10)}.csv`

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  }

  async function handleImportCases(rows) {
    setError('')

    const completedStatus = statuses.find(
      status =>
        status.status_name.toLowerCase() === 'migration completed'
    )

    const payload = rows.map(row => {
      const isCompleted =
        row._statusKey === completedStatus?.status_key

      const completionDate = row['Completion Date']?.trim()

      return {
        user_id: user.id,
        case_id: row['Case ID'].trim(),
        source_product: row['Source Product']?.trim() || null,
        destination_product: row['Destination Product']?.trim() || null,
        received_at: parseCSVDate(row['Received Date']),
        current_status_key: row._statusKey,
        notes: row['Notes']?.trim() || null,
        is_bookmarked: ['yes', 'true'].includes(
          (row['Bookmarked'] || '').trim().toLowerCase()
        ),
        completed_at: isCompleted
          ? completionDate
            ? parseCSVDate(completionDate)
            : new Date().toISOString()
          : null
      }
    })

    const { error: importError } = await supabase
      .from('cases')
      .insert(payload)

    if (importError) {
      setError(`Import failed: ${importError.message}`)
      return
    }

    setShowImportCases(false)

    await loadDashboard()

    window.alert(`${rows.length} cases imported successfully.`)
  }

  async function handleRestore(item) {
    const confirmed = window.confirm(
      `Restore case "${item.case_id}" from the Recycle Bin?`
    )

    if (!confirmed) return

    setRestoringCaseId(item.id)
    setError('')

    const { error: restoreError } = await supabase.rpc(
      'restore_case_from_recycle_bin',
      {
        p_case_id: item.id
      }
    )

    setRestoringCaseId(null)

    if (restoreError) {
      setError(restoreError.message)
      return
    }

    await loadDashboard()
  }

  async function handlePermanentDelete(item) {
    const confirmed = window.confirm(
      `PERMANENTLY DELETE "${item.case_id}"?\n\nThis action cannot be undone. The case and its status history and activity records will be permanently deleted.`
    )

    if (!confirmed) return

    setDeletingCaseId(item.id)
    setError('')

    const { error: deleteError } = await supabase.rpc(
      'permanently_delete_case',
      {
        p_case_id: item.id
      }
    )

    setDeletingCaseId(null)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    await loadDashboard()
  }

  const viewTitle =
    activeView === 'bookmarks'
      ? 'Bookmarked Cases'
      : activeView === 'recycle'
        ? 'Recycle Bin'
        : 'Recent Cases'

  const viewDescription =
    activeView === 'bookmarks'
      ? 'Your important bookmarked migration cases.'
      : activeView === 'recycle'
        ? 'Deleted cases awaiting restoration or permanent deletion.'
        : 'Your latest migration cases.'

  return (
    <div className="dashboard-layout">

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <ShieldCheck size={22} />
          </div>
          <span>Migration Tracker</span>
        </div>

        <div className="sidebar-section-label">
          WORKSPACE
        </div>

        <nav className="sidebar-nav">

          <div
            className={`nav-item ${activeView === 'all' ? 'active' : ''}`}
            onClick={() => setActiveView('all')}
            style={{ cursor: 'pointer' }}
          >
            <LayoutDashboard size={19} />
            <span>Dashboard</span>
          </div>

          <div
            className={`nav-item ${activeView === 'all' ? 'active' : ''}`}
            onClick={() => setActiveView('all')}
            style={{ cursor: 'pointer' }}
          >
            <FolderOpen size={19} />
            <span>All Cases</span>
          </div>

          <div
            className={`nav-item ${activeView === 'bookmarks' ? 'active' : ''}`}
            onClick={() => setActiveView('bookmarks')}
            style={{ cursor: 'pointer' }}
          >
            <Bookmark size={19} />
            <span>Bookmarks</span>
          </div>

          <div
            className={`nav-item ${activeView === 'recycle' ? 'active' : ''}`}
            onClick={() => setActiveView('recycle')}
            style={{ cursor: 'pointer' }}
          >
            <Trash2 size={19} />
            <span>Recycle Bin</span>
          </div>

        </nav>

        <div className="sidebar-bottom">
          <div className="nav-item">
            <Settings size={19} />
            <span>Settings</span>
          </div>

          <div className="sidebar-user">
            <div className="user-avatar">
              {user?.email?.charAt(0).toUpperCase()}
            </div>

            <div className="user-details">
              <strong>My Workspace</strong>
              <span>{user?.email}</span>
            </div>

            <button
              className="sidebar-logout"
              onClick={onLogout}
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="dashboard-main">

        <header className="dashboard-topbar">
          <div>
            <span className="breadcrumb">
              Workspace / {viewTitle}
            </span>
            <h1>Dashboard</h1>
          </div>

          <div className="dashboard-actions">
            <button
              className="theme-button"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
            >
              {theme === 'light'
                ? <Moon size={19} />
                : <Sun size={19} />}
            </button>
          </div>
        </header>

        <div className="dashboard-content">

          <div className="welcome-heading">
            <div>
              <h2>Overview</h2>
              <p>Monitor and manage your migration activities.</p>
            </div>

            <button
              className="refresh-button"
              onClick={loadDashboard}
              disabled={loading}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {activeView !== 'recycle' && (
            <section className="stats-grid">

              <div className="stat-card">
                <span>Total Cases</span>
                <strong>{activeCases.length}</strong>
                <small>All active cases</small>
              </div>

              <div className="stat-card">
                <span>Pending</span>
                <strong>{pending}</strong>
                <small>Awaiting progress</small>
              </div>

              <div className="stat-card">
                <span>In Progress</span>
                <strong>{inProgress}</strong>
                <small>Currently migrating</small>
              </div>

              <div className="stat-card">
                <span>Completed</span>
                <strong>{completed}</strong>
                <small>Successfully completed</small>
              </div>

            </section>
          )}

          <section className="cases-section">

            <div className="cases-heading">
              <div>
                <h2>{viewTitle}</h2>
                <p>{viewDescription}</p>
              </div>

              <div style={{
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap'
              }}>
                {activeView !== 'recycle' && (
                  <>
                    <BackupRestore user={user} />

                    <button
                      className="refresh-button"
                      onClick={handleExportCSV}
                      disabled={activeCases.length === 0}
                    >
                      <Download size={17} />
                      Export CSV
                    </button>

                    <button
                      className="refresh-button"
                      onClick={() => setShowImportCases(true)}
                    >
                      <Download size={17} />
                      Import CSV
                    </button>

                    <button
                      className="add-case-button"
                      onClick={() => setShowAddCase(true)}
                      disabled={statuses.length === 0}
                    >
                      <Plus size={17} />
                      Add New Case
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="case-toolbar">
              <div className="search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search case ID, product or status..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="table-container">
              <table className="cases-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Source Product</th>
                    <th>Destination Product</th>
                    <th>Status</th>
                    <th>Received Date</th>

                    {activeView !== 'recycle' && (
                      <th>Completion Date</th>
                    )}

                    {activeView === 'recycle' && (
                      <th>Actions</th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="empty-state">
                        Loading migration cases...
                      </td>
                    </tr>
                  ) : filteredCases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-state">
                        {search
                          ? 'No matching cases found.'
                          : activeView === 'recycle'
                            ? 'Your Recycle Bin is empty.'
                            : activeView === 'bookmarks'
                              ? 'No bookmarked cases yet.'
                              : 'No migration cases yet.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedCases.map(item => (
                      <tr key={item.id}>
                        <td>
                          {activeView === 'recycle' ? (
                            <strong className="case-id">
                              {item.case_id}
                            </strong>
                          ) : (
                            <button
                              className="case-id case-id-button"
                              onClick={() => setSelectedCase(item)}
                            >
                              {item.case_id}
                            </button>
                          )}
                        </td>

                        <td>{item.source_product || '—'}</td>
                        <td>{item.destination_product || '—'}</td>

                        <td>
                          <span className="status-label">
                            {statusMap[item.current_status_key] ||
                              item.current_status_key}
                          </span>
                        </td>

                        <td>{formatDate(item.received_at)}</td>

                        {activeView !== 'recycle' && (
                          <td>{formatDate(item.completed_at)}</td>
                        )}

                        {activeView === 'recycle' && (
                          <td>
                            <div style={{
                              display: 'flex',
                              gap: '8px',
                              flexWrap: 'wrap'
                            }}>
                              <button
                                type="button"
                                className="cancel-button"
                                onClick={() => handleRestore(item)}
                                disabled={
                                  restoringCaseId !== null ||
                                  deletingCaseId !== null
                                }
                              >
                                <RotateCcw size={15} />
                                {restoringCaseId === item.id
                                  ? 'Restoring...'
                                  : 'Restore'}
                              </button>

                              <button
                                type="button"
                                className="cancel-button"
                                onClick={() => handlePermanentDelete(item)}
                                disabled={
                                  restoringCaseId !== null ||
                                  deletingCaseId !== null
                                }
                              >
                                <Trash2 size={15} />
                                {deletingCaseId === item.id
                                  ? 'Deleting...'
                                  : 'Delete Permanently'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!loading && filteredCases.length > 0 && (
              <div
                className="table-footer"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <span>
                  Showing {startIndex + 1}–{Math.min(endIndex, filteredCases.length)} of {filteredCases.length} cases
                </span>

                {totalPages > 1 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      type="button"
                      className="refresh-button"
                      onClick={() => setCurrentPage(safePage - 1)}
                      disabled={safePage === 1}
                    >
                      Previous
                    </button>

                    {pageNumbers.map(page => (
                      <button
                        key={page}
                        type="button"
                        className="refresh-button"
                        onClick={() => setCurrentPage(page)}
                        style={{
                          minWidth: '36px',
                          justifyContent: 'center',
                          background: safePage === page
                            ? 'var(--primary-color, #2563eb)'
                            : undefined,
                          color: safePage === page
                            ? '#ffffff'
                            : undefined
                        }}
                      >
                        {page}
                      </button>
                    ))}

                    <button
                      type="button"
                      className="refresh-button"
                      onClick={() => setCurrentPage(safePage + 1)}
                      disabled={safePage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}

          </section>

        </div>
      </main>

      {showAddCase && (
        <AddCaseModal
          user={user}
          statuses={statuses}
          onClose={() => setShowAddCase(false)}
          onSaved={loadDashboard}
        />
      )}

      {showImportCases && (
        <ImportCasesModal
          statuses={statuses}
          existingCaseIds={cases.map(item => item.case_id)}
          onClose={() => setShowImportCases(false)}
          onImport={handleImportCases}
        />
      )}

      {selectedCase && (
        <CaseDetails
          caseItem={selectedCase}
          statuses={statuses}
          onClose={() => setSelectedCase(null)}
          onUpdated={loadDashboard}
        />
      )}

    </div>
  )
}

export default Dashboard
