
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Clock, Activity, Save, Bookmark, Trash2 } from 'lucide-react'

function CaseDetails({ caseItem, statuses, onClose, onUpdated }) {
  const [history, setHistory] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStatus, setSelectedStatus] = useState(caseItem.current_status_key)

  const [sourceProduct, setSourceProduct] = useState(caseItem.source_product || '')
  const [destinationProduct, setDestinationProduct] = useState(caseItem.destination_product || '')

  const [receivedAt, setReceivedAt] = useState(
    caseItem.received_at
      ? new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date(caseItem.received_at))
      : ''
  )

  const [completedAt, setCompletedAt] = useState(
    caseItem.completed_at
      ? new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date(caseItem.completed_at))
      : ''
  )

  const [notes, setNotes] = useState(caseItem.notes || '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [isBookmarked, setIsBookmarked] = useState(
    caseItem.is_bookmarked || false
  )

  const statusMap = Object.fromEntries(
    statuses.map(item => [item.status_key, item.status_name])
  )

  const isCompleted =
    statusMap[caseItem.current_status_key]?.toLowerCase() ===
    'migration completed'

  useEffect(() => {
    async function loadDetails() {
      setLoading(true)
      setError('')

      const [historyResult, activityResult] = await Promise.all([
        supabase
          .from('case_status_history')
          .select('*')
          .eq('case_id', caseItem.id)
          .order('changed_at', { ascending: false }),

        supabase
          .from('case_activity')
          .select('*')
          .eq('case_id', caseItem.id)
          .order('created_at', { ascending: false })
      ])

      if (historyResult.error || activityResult.error) {
        setError(
          historyResult.error?.message ||
          activityResult.error?.message
        )
      } else {
        setHistory(historyResult.data || [])
        setActivities(activityResult.data || [])
      }

      setLoading(false)
    }

    loadDetails()
  }, [caseItem.id])

  function formatDate(value) {
    if (!value) return '—'

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    }).format(new Date(value))
  }

  function formatDateOnly(value) {
    if (!value) return '—'

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    }).format(new Date(value))
  }

  async function handleStatusUpdate() {
    if (selectedStatus === caseItem.current_status_key) return

    setSaving(true)
    setError('')
    setSuccess('')

    const { error: updateError } = await supabase.rpc(
      'update_case_status',
      {
        p_case_id: caseItem.id,
        p_new_status_key: selectedStatus
      }
    )

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess('Migration status updated successfully.')
    onUpdated()

    setTimeout(() => {
      onClose()
    }, 1000)
  }

  async function handleSaveDetails() {
    if (!receivedAt) {
      setError('Please select a received date.')
      return
    }

    if (isCompleted && !completedAt) {
      setError('Please select a completion date.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const updateData = {
      source_product: sourceProduct.trim() || null,
      destination_product: destinationProduct.trim() || null,
      received_at: new Date(`${receivedAt}T00:00:00+05:30`).toISOString(),
      notes: notes.trim() || null,
      updated_at: new Date().toISOString()
    }

    if (isCompleted) {
      updateData.completed_at = new Date(
        `${completedAt}T00:00:00+05:30`
      ).toISOString()
    }

    const { error: updateError } = await supabase
      .from('cases')
      .update(updateData)
      .eq('id', caseItem.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess('Case details saved successfully.')
    onUpdated()

    setTimeout(() => {
      onClose()
    }, 1000)
  }

  async function handleBookmarkToggle() {
    const newValue = !isBookmarked

    const { error: updateError } = await supabase
      .from('cases')
      .update({ is_bookmarked: newValue })
      .eq('id', caseItem.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setIsBookmarked(newValue)
    setSuccess(
      newValue
        ? 'Case bookmarked successfully.'
        : 'Bookmark removed.'
    )

    onUpdated()
  }

  async function handleMoveToRecycleBin() {
    const confirmed = window.confirm(
      `Move case "${caseItem.case_id}" to the Recycle Bin? You can restore it later.`
    )

    if (!confirmed) return

    setSaving(true)
    setError('')
    setSuccess('')

    const { error: deleteError } = await supabase.rpc(
      'move_case_to_recycle_bin',
      {
        p_case_id: caseItem.id
      }
    )

    setSaving(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    onUpdated()
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="case-modal details-modal">

        <div className="modal-header">
          <div>
            <h2>Case Details</h2>
            <p>{caseItem.case_id}</p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="modal-close"
              onClick={handleBookmarkToggle}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark case'}
              disabled={saving}
            >
              <Bookmark
                size={20}
                fill={isBookmarked ? 'currentColor' : 'none'}
              />
            </button>

            <button
              type="button"
              className="modal-close"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="status-update-form">
          <div className="form-field">
            <label>Update Migration Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              disabled={saving}
            >
              {statuses.map(item => (
                <option key={item.status_key} value={item.status_key}>
                  {item.status_name}
                </option>
              ))}
            </select>
          </div>

          <button
            className="add-case-button"
            onClick={handleStatusUpdate}
            disabled={saving || selectedStatus === caseItem.current_status_key}
          >
            <Save size={16} />
            {saving ? 'Updating...' : 'Update Status'}
          </button>
        </div>

        <section className="details-section">
          <h3>Migration Information</h3>

          <div className="details-grid">
            <div>
              <span>Case ID</span>
              <strong>{caseItem.case_id}</strong>
            </div>

            <div>
              <span>Current Status</span>
              <strong>
                {statusMap[caseItem.current_status_key] || caseItem.current_status_key}
              </strong>
            </div>

            <div>
              <span>Source Product</span>
              <strong>{caseItem.source_product || '—'}</strong>
            </div>

            <div>
              <span>Destination Product</span>
              <strong>{caseItem.destination_product || '—'}</strong>
            </div>

            <div>
              <span>Received Date</span>
              <strong>{formatDate(caseItem.received_at)}</strong>
            </div>

            <div>
              <span>Last Status Update</span>
              <strong>{formatDate(caseItem.current_status_changed_at)}</strong>
            </div>

            <div>
              <span>Completed Date</span>
              <strong>{formatDateOnly(caseItem.completed_at)}</strong>
            </div>
          </div>
        </section>

        <section className="details-section">
          <h3>Edit Case Details</h3>

          <div className="modal-form-grid">
            <div className="form-field">
              <label>Source Product</label>
              <input
                type="text"
                value={sourceProduct}
                onChange={e => setSourceProduct(e.target.value)}
                disabled={saving}
                placeholder="e.g. cPanel"
              />
            </div>

            <div className="form-field">
              <label>Destination Product</label>
              <input
                type="text"
                value={destinationProduct}
                onChange={e => setDestinationProduct(e.target.value)}
                disabled={saving}
                placeholder="e.g. Titan"
              />
            </div>

            <div className="form-field">
              <label>Received Date</label>
              <input
                type="date"
                value={receivedAt}
                onChange={e => setReceivedAt(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="form-field">
              <label>Completion Date</label>
              <input
                type="date"
                value={completedAt}
                onChange={e => setCompletedAt(e.target.value)}
                disabled={saving || !isCompleted}
              />
              <small>
                Editable only when the migration status is completed.
              </small>
            </div>
          </div>

          <div className="form-field">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={saving}
              rows={4}
              placeholder="Add migration notes..."
            />
          </div>

          <button
            className="add-case-button"
            onClick={handleSaveDetails}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Case Details'}
          </button>
        </section>

        {error && <div className="error-message">{error}</div>}
        {success && <p className="success-message">{success}</p>}

        <section className="details-section">
          <h3><Clock size={17} /> Status History</h3>

          {loading ? (
            <p className="details-empty">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="details-empty">No status changes recorded yet.</p>
          ) : (
            <div className="details-timeline">
              {history.map(item => (
                <div className="timeline-item" key={item.id}>
                  <div className="timeline-dot" />
                  <div>
                    <strong>
                      {statusMap[item.new_status_key] || item.new_status_key}
                    </strong>
                    <p>
                      Previous: {
                        statusMap[item.old_status_key] ||
                        item.old_status_key ||
                        'Initial status'
                      }
                    </p>
                    <small>{formatDate(item.changed_at)}</small>
                    {item.detection_method && (
                      <small>Method: {item.detection_method}</small>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="details-section">
          <h3><Activity size={17} /> Activity Log</h3>

          {loading ? (
            <p className="details-empty">Loading activities...</p>
          ) : activities.length === 0 ? (
            <p className="details-empty">No activities recorded yet.</p>
          ) : (
            <div className="activity-list">
              {activities.map(item => (
                <div className="activity-item" key={item.id}>
                  <strong>{item.activity_type}</strong>
                  <p>{item.description}</p>
                  <small>{formatDate(item.created_at)}</small>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="modal-footer">
          <button
            type="button"
            className="cancel-button"
            onClick={handleMoveToRecycleBin}
            disabled={saving}
          >
            <Trash2 size={16} />
            {saving ? 'Moving...' : 'Move to Recycle Bin'}
          </button>

          <button
            type="button"
            className="cancel-button"
            onClick={onClose}
            disabled={saving}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  )
}

export default CaseDetails
