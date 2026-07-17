'use client';

import { useRef, useState } from 'react';
import { apiDownload, apiUpload } from '@/lib/api';
import type { HouseholdImportResult } from '@/lib/types';
import { Button, Card, ErrorText } from './ui';

export function HouseholdImport({
  masjidId,
  onImported,
}: {
  masjidId: string;
  onImported: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<HouseholdImportResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingFile = useRef<File | null>(null);

  const reset = () => {
    setPreview(null);
    setFileName('');
    pendingFile.current = null;
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadTemplate = async () => {
    setError('');
    try {
      await apiDownload(
        `/masjids/${masjidId}/households/import/template`,
        'households-import-template.xlsx',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingFile.current = file;
    setFileName(file.name);
    setPreview(null);
    setNotice('');
    setError('');
    setBusy(true);
    try {
      const result = await apiUpload<HouseholdImportResult>(
        `/masjids/${masjidId}/households/import`,
        file,
        { dryRun: 'true' },
      );
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the file');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!pendingFile.current) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiUpload<HouseholdImportResult>(
        `/masjids/${masjidId}/households/import`,
        pendingFile.current,
      );
      setNotice(`Imported ${result.households} household(s) and ${result.members} people.`);
      reset();
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const hasErrors = (preview?.errors.length ?? 0) > 0;

  return (
    <Card
      title="Import from Excel"
      actions={
        <Button variant="secondary" onClick={downloadTemplate}>
          Download template
        </Button>
      }
    >
      <p className="mb-3 text-sm text-slate-500">
        One row per person; rows with the same family &amp; head become one household. Download the
        template for the exact format.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        onChange={onPick}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-emerald-800 hover:file:bg-emerald-100"
      />

      {busy && !preview && <p className="mt-3 text-sm text-slate-400">Reading {fileName}…</p>}
      <ErrorText>{error}</ErrorText>
      {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}

      {preview && !hasErrors && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">
            Ready to import <strong>{preview.households}</strong> household(s) and{' '}
            <strong>{preview.members}</strong> people from {fileName}.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={commit} disabled={busy}>
              {busy ? 'Importing…' : 'Confirm import'}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {preview && hasErrors && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            {preview.errors.length} row(s) need fixing — nothing was imported.
          </p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-red-700">
            {preview.errors.map((err) => (
              <li key={err.row}>
                Row {err.row}: {err.message}
              </li>
            ))}
          </ul>
          <Button variant="ghost" className="mt-2" onClick={reset}>
            Choose another file
          </Button>
        </div>
      )}
    </Card>
  );
}
