
import { useState } from 'react'
import Papa from 'papaparse'
import { X, Upload, Download, FileSpreadsheet } from 'lucide-react'

function parseDate(value) {
  if (!value?.trim()) return null

  const text = value.trim()

  // DD/MM/YYYY
  let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)

  if (match) {
    const [, day, month, year] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day))

    if (
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day)
    ) {
      return date
    }

    return false
  }

  // DD Mon YYYY
  match = text.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)

  if (match) {
    const date = new Date(`${text} 12:00:00`)
    return Number.isNaN(date.getTime()) ? false : date
  }

  // YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (match) {
    const [, year, month, day] = match
    const date = new Date(Number(year), Number(month) - 1, Number(day))

    if (
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day)
    ) {
      return date
    }

    return false
  }

  return false
}

export default function ImportCasesModal({
  onClose,
  onImport,
  statuses = [],
  existingCaseIds = []
}) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [error, setError] = useState('')
  const [validated, setValidated] = useState(false)

  const downloadTemplate = () => {
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

    const csv = Papa.unparse({
      fields: headers,
      data: [[
        'CASE-1001',
        'cPanel',
        'Titan',
        '07/11/2026',
        'Waiting for passwords',
        'waiting_passwords',
        'Sample notes',
        'No',
        '',
        ''
      ]]
    })

    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;'
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'migration-cases-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleFileChange = (selectedFile) => {
    setFile(selectedFile)
    setPreview([])
    setError('')
    setValidated(false)

    if (!selectedFile) return

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a CSV file.')
      return
    }

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      transformHeader: header => header.trim(),
      complete: (results) => {
        if (!results.meta.fields || results.meta.fields.length === 0) {
          setError('The CSV file does not contain valid column headers.')
          return
        }

        setPreview(
          results.data.map((row, index) => ({
            ...row,
            _rowNumber: index + 2,
            _errors: []
          }))
        )
      },
      error: () => {
        setError('Unable to read this CSV file.')
      }
    })
  }

  const validateRows = () => {
    if (!preview.length) {
      setError('There are no rows to validate.')
      return
    }

    const seenIds = new Set()

    const existingIds = new Set(
      existingCaseIds.map(id => id.trim().toLowerCase())
    )

    const validatedRows = preview.map(row => {
      const errors = []
      const caseId = (row['Case ID'] || '').trim()
      const statusKey = (row['Status Key'] || '').trim()
      const statusName = (row['Status'] || '').trim()

      if (!caseId) {
        errors.push('Case ID is required.')
      } else {
        const normalizedId = caseId.toLowerCase()

        if (seenIds.has(normalizedId)) {
          errors.push('Duplicate Case ID within this CSV file.')
        } else {
          seenIds.add(normalizedId)
        }

        if (existingIds.has(normalizedId)) {
          errors.push('This Case ID already exists in your tracker.')
        }
      }

      const matchingStatus = statuses.find(status =>
        (statusKey && status.status_key.toLowerCase() === statusKey.toLowerCase()) ||
        (statusName && status.status_name.toLowerCase() === statusName.toLowerCase())
      )

      if (!matchingStatus) {
        errors.push('Missing or invalid status. Check Status or Status Key.')
      }

      const receivedDate = row['Received Date'] || ''

      if (receivedDate.trim() && parseDate(receivedDate) === false) {
        errors.push('Invalid Received Date. Use DD/MM/YYYY or DD Mon YYYY.')
      }

      const completionDate = row['Completion Date'] || ''

      if (completionDate.trim() && parseDate(completionDate) === false) {
        errors.push('Invalid Completion Date.')
      }

      if (
        completionDate.trim() &&
        matchingStatus?.status_name.toLowerCase() !== 'migration completed'
      ) {
        errors.push('Completion Date can only be provided for Migration Completed cases.')
      }

      const bookmarked = (row['Bookmarked'] || '').trim().toLowerCase()

      if (bookmarked && !['yes', 'no', 'true', 'false'].includes(bookmarked)) {
        errors.push('Bookmarked must be Yes, No, True or False.')
      }

      return {
        ...row,
        _statusKey: matchingStatus?.status_key || '',
        _errors: errors
      }
    })

    setPreview(validatedRows)
    setValidated(true)
    setError('')
  }

  const validRows = preview.filter(row => row._errors.length === 0)
  const invalidRows = preview.filter(row => row._errors.length > 0)

  const handleImport = () => {
    if (!validated || validRows.length === 0) {
      setError('Please validate the file and make sure at least one valid row exists.')
      return
    }

    onImport(validRows)
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 32px)',
          height: 'calc(100vh - 32px)',
          overflow: 'hidden'
        }}
      >
        <div
          className="modal-header"
          style={{ flexShrink: 0 }}
        >
          <div>
            <h2>Import Cases from CSV</h2>
            <p>Upload and validate your migration cases before importing.</p>
          </div>

          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div
          className="modal-body"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden'
          }}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={downloadTemplate}
          >
            <Download size={17} />
            Download CSV Template
          </button>

          <div className="import-upload-area">
            <FileSpreadsheet size={32} />
            <h3>Select your CSV file</h3>
            <p>Choose the CSV file containing your migration cases.</p>

            <label className="primary-button import-file-label">
              <Upload size={17} />
              Choose CSV File
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={e => handleFileChange(e.target.files?.[0])}
              />
            </label>

            {file && <p className="import-file-name">{file.name}</p>}
          </div>

          {error && <p className="form-error">{error}</p>}

          {preview.length > 0 && (
            <div className="import-preview">
              <h3>CSV Preview</h3>
              <p>{preview.length} rows found in your file.</p>

              {validated && (
                <p>
                  Valid rows: {validRows.length} | Invalid rows: {invalidRows.length}
                </p>
              )}

              <div className="import-preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Case ID</th>
                      <th>Status</th>
                      {validated && <th>Validation</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {preview.map((row, index) => (
                      <tr key={index}>
                        <td>{row._rowNumber}</td>
                        <td>{row['Case ID'] || '—'}</td>
                        <td>{row['Status'] || row['Status Key'] || '—'}</td>
                        {validated && (
                          <td>
                            {row._errors.length === 0
                              ? 'Valid'
                              : row._errors.join(' ')}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={validateRows}
              >
                Validate CSV
              </button>
            </div>
          )}
        </div>

        <div
          className="modal-footer"
          style={{ flexShrink: 0 }}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleImport}
            disabled={!validated || validRows.length === 0}
          >
            Import {validRows.length} Valid Cases
          </button>
        </div>
      </div>
    </div>
  )
}
