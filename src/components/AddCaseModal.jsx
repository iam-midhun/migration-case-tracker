
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Save } from 'lucide-react'

function AddCaseModal({ user, statuses, onClose, onSaved }) {
  const today = new Date().toLocaleDateString('en-CA')

  const [caseId, setCaseId] = useState('')
  const [sourceProduct, setSourceProduct] = useState('')
  const [destinationProduct, setDestinationProduct] = useState('')
  const [receivedAt, setReceivedAt] = useState(today)
  const [status, setStatus] = useState(
    statuses.find(item => item.status_key === 'waiting_passwords')?.status_key ||
    statuses[0]?.status_key || ''
  )
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!caseId.trim()) {
      setError('Please enter a Case ID.')
      return
    }

    setSaving(true)

    const { error: insertError } = await supabase
      .from('cases')
      .insert({
        user_id: user.id,
        case_id: caseId.trim(),
        source_product: sourceProduct.trim() || null,
        destination_product: destinationProduct.trim() || null,
        received_at: new Date(`${receivedAt}T00:00:00`).toISOString(),
        current_status_key: status,
        notes: notes.trim() || null
      })

    setSaving(false)

    if (insertError) {
      if (insertError.code === '23505') {
        setError('This Case ID already exists in your workspace.')
      } else {
        setError(insertError.message)
      }
      return
    }

    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="case-modal">
        <div className="modal-header">
          <div>
            <h2>Add New Case</h2>
            <p>Enter the migration case details.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-form-grid">
            <div className="form-field full-width">
              <label>Case ID *</label>
              <input
                value={caseId}
                onChange={e => setCaseId(e.target.value)}
                placeholder="Enter case ID"
                required
              />
            </div>

            <div className="form-field">
              <label>Source Product</label>
              <input
                value={sourceProduct}
                onChange={e => setSourceProduct(e.target.value)}
                placeholder="e.g. cPanel"
              />
            </div>

            <div className="form-field">
              <label>Destination Product</label>
              <input
                value={destinationProduct}
                onChange={e => setDestinationProduct(e.target.value)}
                placeholder="e.g. Titan Email"
              />
            </div>

            <div className="form-field">
              <label>Received Date</label>
              <input
                type="date"
                value={receivedAt}
                onChange={e => setReceivedAt(e.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label>Current Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                required
              >
                {statuses.map(item => (
                  <option key={item.status_key} value={item.status_key}>
                    {item.status_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field full-width">
              <label>Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add any relevant migration notes..."
                rows={4}
              />
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="cancel-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="add-case-button" disabled={saving}>
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddCaseModal
