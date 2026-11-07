
import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Download, Upload } from 'lucide-react'

// Fetch every record in batches of 500.
async function fetchAllRows(query) {
  const batchSize = 500
  let allRows = []
  let from = 0

  while (true) {
    const { data, error } = await query.range(
      from,
      from + batchSize - 1
    )

    if (error) throw error

    const rows = data || []
    allRows = allRows.concat(rows)

    if (rows.length < batchSize) break

    from += batchSize
  }

  return allRows
}

const tableNames = [
  'profiles',
  'case_statuses',
  'cases',
  'case_status_history',
  'case_activity',
  'app_settings',
  'import_logs'
]

export default function BackupRestore({ user }) {
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const fileInputRef = useRef(null)

  async function downloadBackup() {
    if (loading || restoring) return

    setLoading(true)

    try {
      const queries = [
        supabase.from('profiles').select('*').eq('id', user.id).order('id'),
        supabase.from('case_statuses').select('*')
          .or(`user_id.eq.${user.id},user_id.is.null`).order('id'),
        supabase.from('cases').select('*').eq('user_id', user.id).order('id'),
        supabase.from('case_status_history').select('*')
          .eq('user_id', user.id).order('id'),
        supabase.from('case_activity').select('*')
          .eq('user_id', user.id).order('id'),
        supabase.from('app_settings').select('*')
          .eq('user_id', user.id).order('id'),
        supabase.from('import_logs').select('*')
          .eq('user_id', user.id).order('id')
      ]

      const backupData = {}

      for (let i = 0; i < queries.length; i++) {
        try {
          backupData[tableNames[i]] = await fetchAllRows(queries[i])
        } catch (err) {
          throw new Error(
            `Unable to back up ${tableNames[i]}: ${err.message}`
          )
        }
      }

      const backup = {
        application: 'Migration Case Tracker',
        backup_version: 1,
        exported_at: new Date().toISOString(),
        account: {
          user_id: user.id,
          email: user.email
        },
        tables: backupData
      }

      const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: 'application/json;charset=utf-8' }
      )

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = `migration-tracker-backup-${new Date()
        .toISOString().slice(0, 10)}.json`

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      const totalRecords = Object.values(backupData)
        .reduce((total, rows) => total + rows.length, 0)

      window.alert(
        `Full backup downloaded successfully.\n\n` +
        `Total records backed up: ${totalRecords}\n\n` +
        `Keep this JSON file somewhere safe.`
      )
    } catch (err) {
      window.alert(`Backup failed:\n${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleRestoreFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || restoring || loading) return

    setRestoring(true)

    try {
      const text = await file.text()
      let backup

      try {
        backup = JSON.parse(text)
      } catch {
        throw new Error('The selected file is not valid JSON.')
      }

      if (
        backup.application !== 'Migration Case Tracker' ||
        backup.backup_version !== 1
      ) {
        throw new Error(
          'This file is not a supported Migration Case Tracker backup.'
        )
      }

      if (backup.account?.user_id !== user.id) {
        throw new Error(
          'This backup belongs to a different account. Restore is only allowed to the original account.'
        )
      }

      if (!backup.tables || !tableNames.every(
        name => Array.isArray(backup.tables[name])
      )) {
        throw new Error(
          'The backup is incomplete. One or more required tables are missing.'
        )
      }

      const tables = backup.tables

      // Validate that every user-owned record belongs to this account.
      const userOwnedTables = [
        'profiles',
        'cases',
        'case_status_history',
        'case_activity',
        'app_settings',
        'import_logs'
      ]

      for (const table of userOwnedTables) {
        for (const row of tables[table]) {
          const ownerId = table === 'profiles' ? row.id : row.user_id

          if (ownerId !== user.id) {
            throw new Error(
              `The backup contains a record in ${table} belonging to another account.`
            )
          }
        }
      }

      for (const row of tables.case_statuses) {
        if (row.user_id !== null && row.user_id !== user.id) {
          throw new Error(
            'The backup contains a status belonging to another account.'
          )
        }
      }

      if (!window.confirm(
        `Restore this backup?\n\n` +
        `Cases in backup: ${tables.cases.length}\n` +
        `Status history records: ${tables.case_status_history.length}\n` +
        `Activity records: ${tables.case_activity.length}\n\n` +
        `Existing records will not be overwritten. Duplicate records will be skipped.\n\n` +
        `Continue?`
      )) {
        return
      }

      const counts = {
        statuses: 0,
        cases: 0,
        history: 0,
        activity: 0,
        settings: 0,
        importLogs: 0,
        skipped: 0
      }

      // 1. Restore custom statuses.
      const { data: existingStatuses, error: statusError } =
        await supabase
          .from('case_statuses')
          .select('id, status_key')
          .eq('user_id', user.id)

      if (statusError) throw statusError

      const statusIds = new Set(
        existingStatuses.map(row => row.id)
      )
      const statusKeys = new Set(
        existingStatuses.map(row => row.status_key)
      )

      for (const row of tables.case_statuses) {
        // Shared default statuses already exist in the database.
        if (row.user_id === null) {
          counts.skipped++
          continue
        }

        if (
          statusIds.has(row.id) ||
          statusKeys.has(row.status_key)
        ) {
          counts.skipped++
          continue
        }

        const { error } = await supabase
          .from('case_statuses')
          .insert({ ...row, user_id: user.id })

        if (error) throw new Error(
          `Status ${row.status_name}: ${error.message}`
        )

        statusIds.add(row.id)
        statusKeys.add(row.status_key)
        counts.statuses++
      }

      // 2. Restore cases.
      const existingCases = await fetchAllRows(
        supabase.from('cases')
          .select('id, case_id')
          .eq('user_id', user.id)
          .order('id')
      )

      const existingCaseIds = new Set(
        existingCases.map(row => row.id)
      )
      const existingCaseNumbers = new Set(
        existingCases.map(row => row.case_id.toLowerCase())
      )

      // Only these case UUIDs can safely receive restored history/activity.
      const validCaseIds = new Set(existingCaseIds)

      for (const row of tables.cases) {
        const duplicate =
          existingCaseIds.has(row.id) ||
          existingCaseNumbers.has(row.case_id.toLowerCase())

        if (duplicate) {
          counts.skipped++

          // Exact UUID match means related history can still be restored.
          if (existingCaseIds.has(row.id)) {
            validCaseIds.add(row.id)
          }

          continue
        }

        const { error } = await supabase
          .from('cases')
          .insert({ ...row, user_id: user.id })

        if (error) {
          throw new Error(
            `Case ${row.case_id}: ${error.message}`
          )
        }

        existingCaseIds.add(row.id)
        existingCaseNumbers.add(row.case_id.toLowerCase())
        validCaseIds.add(row.id)
        counts.cases++
      }

      // Helper: restore records by UUID without overwriting existing ones.
      async function restoreChildRecords(table, rows, countKey) {
        const existingRows = await fetchAllRows(
          supabase.from(table)
            .select('id')
            .eq('user_id', user.id)
            .order('id')
        )

        const existingIds = new Set(
          existingRows.map(row => row.id)
        )

        for (const row of rows) {
          if (existingIds.has(row.id)) {
            counts.skipped++
            continue
          }

          if (!validCaseIds.has(row.case_id)) {
            counts.skipped++
            continue
          }

          const { error } = await supabase
            .from(table)
            .insert({ ...row, user_id: user.id })

          if (error) {
            throw new Error(
              `Unable to restore ${table}: ${error.message}`
            )
          }

          existingIds.add(row.id)
          counts[countKey]++
        }
      }

      // 3. Restore history and activity after cases.
      await restoreChildRecords(
        'case_status_history',
        tables.case_status_history,
        'history'
      )

      await restoreChildRecords(
        'case_activity',
        tables.case_activity,
        'activity'
      )

      // 4. Restore settings only if none exist.
      const { data: existingSettings, error: settingsError } =
        await supabase
          .from('app_settings')
          .select('id')
          .eq('user_id', user.id)

      if (settingsError) throw settingsError

      if (
        tables.app_settings.length > 0 &&
        existingSettings.length === 0
      ) {
        const settingsRow = tables.app_settings[0]

        const { error } = await supabase
          .from('app_settings')
          .insert({ ...settingsRow, user_id: user.id })

        if (error) throw error

        counts.settings++
      } else {
        counts.skipped += tables.app_settings.length
      }

      // 5. Restore import logs.
      const existingLogs = await fetchAllRows(
        supabase.from('import_logs')
          .select('id')
          .eq('user_id', user.id)
          .order('id')
      )

      const existingLogIds = new Set(
        existingLogs.map(row => row.id)
      )

      for (const row of tables.import_logs) {
        if (existingLogIds.has(row.id)) {
          counts.skipped++
          continue
        }

        const { error } = await supabase
          .from('import_logs')
          .insert({ ...row, user_id: user.id })

        if (error) throw error

        existingLogIds.add(row.id)
        counts.importLogs++
      }

      // 6. Update the existing profile if a backup profile exists.
      if (tables.profiles.length > 0) {
        const profile = tables.profiles[0]

        const { error } = await supabase
          .from('profiles')
          .update({ display_name: profile.display_name })
          .eq('id', user.id)

        if (error) throw error
      }

      window.alert(
        `Restore completed successfully.\n\n` +
        `Custom statuses restored: ${counts.statuses}\n` +
        `Cases restored: ${counts.cases}\n` +
        `Status history restored: ${counts.history}\n` +
        `Activity records restored: ${counts.activity}\n` +
        `Settings restored: ${counts.settings}\n` +
        `Import logs restored: ${counts.importLogs}\n\n` +
        `Records skipped: ${counts.skipped}\n\n` +
        `Existing records were not overwritten.`
      )

      window.location.reload()
    } catch (err) {
      window.alert(
        `Restore stopped because of an error:\n\n${err.message}\n\n` +
        `Some earlier records may already have been restored. ` +
        `You can safely retry the same backup; existing records will be skipped.`
      )
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="refresh-button"
        onClick={downloadBackup}
        disabled={loading || restoring}
      >
        <Download size={17} />
        {loading ? 'Creating Backup...' : 'Full Backup'}
      </button>

      <button
        type="button"
        className="refresh-button"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading || restoring}
      >
        <Upload size={17} />
        {restoring ? 'Restoring...' : 'Restore Backup'}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleRestoreFile}
      />
    </>
  )
}
