import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiCheckCircle,
  FiCloud,
  FiDatabase,
  FiFileText,
  FiFilter,
  FiHardDrive,
  FiLoader,
  FiSearch,
} from 'react-icons/fi';
import { ToastStack, type ToastMessage } from '../../components/common/Toast';
import { ImportPreviewModal } from '../../components/patients/ImportPreviewModal';
import { ImportProgressModal } from '../../components/patients/ImportProgressModal';
import { PatientAnalysisModal } from '../../components/patients/PatientAnalysisModal';
import { PatientMetadataModal } from '../../components/patients/PatientMetadataModal';
import { PatientTable } from '../../components/patients/PatientTable';
import { usePageTitle } from '../../hooks/usePageTitle';
import { createPatientTest, deletePatientTest, getPatientTest, getPatientTests, updatePatientTestMetadata } from '../../services/patientTests.service';
import type { PatientMetadataFormValues, PatientTestRecord } from '../../types/patientTest';

function isCompleted(values: PatientMetadataFormValues) {
  return Boolean(values.patientName && values.gender && values.age && values.caseHistory && values.description);
}

type UsbImportState =
  | 'No USB Connected'
  | 'USB Connected'
  | 'Scanning Files'
  | 'Ready to Import'
  | 'Importing'
  | 'Import Complete';

const txtFilesFound = 'Unknown';

const usbStateClasses: Record<UsbImportState, string> = {
  'Import Complete': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Importing: 'bg-blue-50 text-blue-700 ring-blue-200',
  'No USB Connected': 'bg-slate-50 text-slate-600 ring-slate-200',
  'Ready to Import': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Scanning Files': 'bg-amber-50 text-amber-700 ring-amber-200',
  'USB Connected': 'bg-blue-50 text-blue-700 ring-blue-200',
};

const filterOptions = [
  'All Records',
  'Completed',
  'Pending',
  'Newest First',
  'Oldest First',
] as const;

type RecordFilter = (typeof filterOptions)[number];

function getRecordTime(record: PatientTestRecord) {
  const dateParts = record.testDate.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);

  if (dateParts) {
    const [, day, month, year] = dateParts;
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
  }

  const testDateTime = Date.parse(record.testDate);
  const importedTime = Date.parse(record.importedAt);
  return Number.isNaN(testDateTime) ? (Number.isNaN(importedTime) ? 0 : importedTime) : testDateTime;
}

export function PatientsPage() {
  usePageTitle('Patients');
  const [records, setRecords] = useState<PatientTestRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRecord, setEditingRecord] = useState<PatientTestRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<PatientTestRecord | null>(null);
  const [analysisRecord, setAnalysisRecord] = useState<PatientTestRecord | null>(null);
  const [activeFilter, setActiveFilter] = useState<RecordFilter>('All Records');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [isImportProgressOpen, setIsImportProgressOpen] = useState(false);
  const [importButtonState, setImportButtonState] = useState<'default' | 'ready' | 'importing'>('ready');
  const [usbStatus, setUsbStatus] = useState<{
    connected: boolean;
    device: {
      deviceName: string;
      driveLetter: string;
      driveType: number;
      isRemovable: boolean;
      status: 'connected' | 'disconnected';
      volumeLabel: string;
    } | null;
  }>({
    connected: false,
    device: null,
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [txtFilesFoundCount, setTxtFilesFoundCount] = useState<number | null>(null);

  const pendingCount = useMemo(() => records.filter((record) => record.status === 'Pending').length, [records]);
  const completedCount = records.length - pendingCount;
  const filteredRecords = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    const searchedRecords = normalizedQuery
      ? records.filter((record) =>
      [record.id, record.patientName, record.testDate, record.caseHistory, record.description, record.status, record.age]
        .map((value) => String(value ?? '').toLocaleLowerCase())
        .some((value) => value.includes(normalizedQuery)),
      )
      : records;

    if (activeFilter === 'Completed' || activeFilter === 'Pending') {
      return searchedRecords.filter((record) => record.status === activeFilter);
    }

    const sortedRecords = [...searchedRecords];

    if (activeFilter === 'Newest First') {
      return sortedRecords.sort((left, right) => getRecordTime(right) - getRecordTime(left));
    }
    if (activeFilter === 'Oldest First') {
      return sortedRecords.sort((left, right) => getRecordTime(left) - getRecordTime(right));
    }

    return searchedRecords;
  }, [activeFilter, records, searchQuery]);
  const hasElectronImport = Boolean(window.medilogix?.usb);
  const usbState: UsbImportState = hasElectronImport ? (usbStatus.connected ? 'Ready to Import' : 'No USB Connected') : 'Ready to Import';
  const usbDeviceName = hasElectronImport ? (usbStatus.device?.deviceName ?? 'No USB Connected') : 'Browser File Picker';
  const usbDriveLetter = usbStatus.device?.driveLetter ?? '-';
  const usbConnectionStatus = hasElectronImport ? (usbStatus.connected ? 'Connected' : 'Disconnected') : 'Available';
  const displayedTxtFilesFound = hasElectronImport && !usbStatus.connected ? '-' : (txtFilesFoundCount ?? txtFilesFound);

  const pushToast = useCallback((message: string, tone: ToastMessage['tone']) => {
    const id = `${Date.now()}-${message}`;
    setToasts((currentToasts) => [...currentToasts.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, 3500);
  }, []);

  useEffect(() => {
    void getPatientTests()
      .then((savedRecords) => {
        setRecords(savedRecords.map((record) => ({ ...record, recordKey: record.recordId })));
      })
      .catch(() => {
        pushToast('Saved records could not be loaded', 'danger');
      });
  }, [pushToast]);

  useEffect(() => {
    const usbBridge = window.medilogix?.usb;

    if (!usbBridge) {
      return undefined;
    }

    void usbBridge.getStatus().then((status) => {
      setUsbStatus(status);
      setTxtFilesFoundCount(null);
    });

    const unsubscribeStatus = usbBridge.onStatus((status) => {
      setUsbStatus(status);
      setTxtFilesFoundCount(null);
    });
    const unsubscribeConnected = usbBridge.onConnected((device) => {
      setUsbStatus({ connected: true, device });
      setTxtFilesFoundCount(null);
    });
    const unsubscribeDisconnected = usbBridge.onDisconnected(() => {
      setUsbStatus({ connected: false, device: null });
      setTxtFilesFoundCount(null);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeConnected();
      unsubscribeDisconnected();
    };
  }, []);

  async function handleSaveMetadata(values: PatientMetadataFormValues) {
    if (!editingRecord) {
      return false;
    }

    if (!isCompleted(values)) {
      pushToast("Complete all Patient's Info fields before saving", 'warning');
      return false;
    }

    try {
      const savedRecord = editingRecord.recordId
        ? await updatePatientTestMetadata(editingRecord.recordId, values)
        : await createPatientTest({
            ...editingRecord,
            ...values,
            status: 'Completed',
          });
      const editingKey = editingRecord.recordKey ?? editingRecord.recordId ?? editingRecord.id;

      setRecords((currentRecords) =>
        currentRecords.map((record) => {
          const recordKey = record.recordKey ?? record.recordId ?? record.id;

          return recordKey === editingKey ? { ...savedRecord, recordKey: savedRecord.recordId } : record;
        }),
      );
      pushToast('Patient test record saved', 'success');
      return true;
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Record was not saved. Complete every required field and try again.', 'danger');
      return false;
    }
  }

  async function handleStartImport() {
    setIsImportPreviewOpen(false);
    setIsImportProgressOpen(true);
    setImportButtonState('importing');

    try {
      const result = await window.medilogix?.usb.importTxtFiles();

      if (!result) {
        pushToast('Import is only available in the Electron desktop app', 'warning');
        return;
      }

      setTxtFilesFoundCount(result.txtFilesFound);
      const importedRecords = result.records.map((record) => ({
        ...record,
        recordKey: `imported-${record.id}-${record.importedAt}`,
        samples: record.samples.map((sample) => ({
          time: sample.timestamp,
          timestamp: sample.timestamp,
          psi: sample.psi,
        })),
      }));

      setRecords((currentRecords) => [...importedRecords, ...currentRecords]);

      if (result.records.length > 0) {
        pushToast(`${result.records.length} files imported successfully.`, 'success');
      }

      result.errors.forEach((error) => {
        pushToast(`${error.fileName}: ${error.message}`, result.txtFilesFound === 0 ? 'warning' : 'danger');
      });
    } catch {
      pushToast('Import Failed', 'danger');
    } finally {
      setIsImportProgressOpen(false);
      setImportButtonState('ready');
    }
  }

  async function handleViewAnalysis(record: PatientTestRecord) {
    if (!record.recordId) {
      setAnalysisRecord(record);
      return;
    }

    try {
      setAnalysisRecord(await getPatientTest(record.recordId));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Analysis could not be loaded', 'danger');
    }
  }

  async function handleConfirmDelete() {
    if (!deletingRecord) {
      return;
    }

    const record = deletingRecord;
    const recordKey = record.recordKey ?? record.recordId ?? record.id;
    setDeletingRecord(null);

    if (!record.recordId) {
      setRecords((currentRecords) => currentRecords.filter((currentRecord) => (currentRecord.recordKey ?? currentRecord.recordId ?? currentRecord.id) !== recordKey));
      pushToast('Imported record removed', 'success');
      return;
    }

    try {
      await deletePatientTest(record.recordId);
      const savedRecords = await getPatientTests();
      const stillExists = savedRecords.some((savedRecord) => savedRecord.recordId === record.recordId);

      setRecords(savedRecords.map((savedRecord) => ({ ...savedRecord, recordKey: savedRecord.recordId })));
      pushToast(stillExists ? 'Delete requested, but record still appears in the table' : 'Patient test record deleted', stillExists ? 'warning' : 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Record could not be deleted', 'danger');
    }
  }

  const importButtonLabel =
    importButtonState === 'importing'
      ? 'Importing...'
      : importButtonState === 'ready'
        ? 'Import TXT'
        : 'Import TXT';

  return (
    <div className="space-y-6">
      <ToastStack messages={toasts} />

      <div className="rounded-xl border border-[#dfe7f2] bg-white/92 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="grid gap-5 xl:grid-cols-[minmax(240px,1fr)_minmax(300px,520px)_auto] xl:items-center">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#059669]">Patient workspace</p>
          <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-normal text-[#07194c]">Patients</h1>
          <p className="mt-2 text-[16px] font-medium text-[#68779f]">
            {records.length} imported tests - {pendingCount} Patient&apos;s Info pending - {completedCount} completed
          </p>
        </div>

        <label className="flex h-12 min-w-0 items-center gap-4 rounded-md border border-[#d7deea] bg-[#f8fbff] px-5 shadow-sm focus-within:border-[#0647ff] focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
          <FiSearch aria-hidden="true" className="shrink-0 text-[#64749f]" size={21} />
          <input
            aria-label="Search patient records"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium text-[#07194c] outline-none placeholder:text-[#6f7fa6]"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search ID, name, date, history, description, status, or age..."
            type="search"
            value={searchQuery}
          />
        </label>

        <div className="flex flex-wrap gap-4 xl:justify-end">
          <div className="relative">
            <button
              className="inline-flex h-12 min-w-[120px] items-center justify-center gap-3 rounded-md border border-[#d7deea] bg-white px-6 text-[16px] font-bold text-[#07194c] shadow-sm transition hover:border-[#0647ff] hover:bg-[#eef4ff] hover:text-[#0647ff]"
              onClick={() => setIsFilterOpen((value) => !value)}
              type="button"
            >
              <FiFilter aria-hidden="true" size={20} />
              {activeFilter === 'All Records' ? 'Filter' : activeFilter}
            </button>
            {isFilterOpen ? (
              <div className="absolute right-0 top-14 z-20 w-56 overflow-hidden rounded-lg border border-[#e1e7f2] bg-white py-2 shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
                {filterOptions.map((option) => (
                  <button
                    aria-pressed={activeFilter === option}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-bold transition hover:bg-[#f6f8fb] ${
                      activeFilter === option ? 'bg-[#eef4ff] text-[#0647ff]' : 'text-[#07194c]'
                    }`}
                    key={option}
                    onClick={() => {
                      setActiveFilter(option);
                      setIsFilterOpen(false);
                    }}
                    type="button"
                  >
                    {option}
                    {activeFilter === option ? <FiCheckCircle aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            className="inline-flex h-12 min-w-[150px] items-center justify-center gap-3 rounded-md bg-[#0647ff] px-6 text-[16px] font-bold text-white shadow-[0_14px_30px_rgba(6,71,255,0.28)] transition hover:bg-[#053ee0]"
            onClick={() => setIsImportPreviewOpen(true)}
            type="button"
          >
            {importButtonState === 'importing' ? (
              <FiLoader aria-hidden="true" className="animate-spin" size={20} />
            ) : (
              <FiCloud aria-hidden="true" size={20} />
            )}
            {importButtonLabel}
          </button>
        </div>
      </div>
      </div>

      {(hasElectronImport ? usbStatus.connected : true) && (
        <section className="rounded-xl border border-[#dfe7f2] bg-white p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-[#eef4ff] text-[#0647ff] shadow-inner">
                <FiHardDrive aria-hidden="true" size={26} />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-normal text-[#68779f]">USB Device</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-normal text-[#07194c]">{usbDeviceName}</h2>
                <span className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ring-1 ${usbStateClasses[usbState]}`}>
                  {(usbState as string) === 'Importing' || (usbState as string) === 'Scanning Files' ? (
                    <FiLoader aria-hidden="true" className="animate-spin" />
                  ) : (
                    <FiCheckCircle aria-hidden="true" />
                  )}
                  {usbState}
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:min-w-[520px]">
              <div className="min-w-0 rounded-lg border border-[#e7edf6] bg-[#f8fbff] p-4">
                <p className="break-words text-xs font-bold uppercase leading-5 text-[#68779f]">Status</p>
                <p className="mt-2 break-words text-base font-extrabold text-[#07194c]">{usbConnectionStatus}</p>
              </div>
              <div className="min-w-0 rounded-lg border border-[#e7edf6] bg-[#f8fbff] p-4">
                <p className="break-words text-xs font-bold uppercase leading-5 text-[#68779f]">TXT Files Found</p>
                <p className="mt-2 break-words text-base font-extrabold text-[#07194c]">{displayedTxtFilesFound}</p>
              </div>
              <div className="min-w-0 rounded-lg border border-[#e7edf6] bg-[#f8fbff] p-4">
                <p className="break-words text-xs font-bold uppercase leading-5 text-[#68779f]">Drive</p>
                <p className="mt-2 break-words text-base font-extrabold text-[#07194c]">{usbDriveLetter}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-[#dfe7f2] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <FiFileText aria-hidden="true" className="text-[#0647ff]" size={22} />
            <p className="text-sm font-bold text-[#68779f]">Today&apos;s Imports</p>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-[#07194c]">{records.length}</p>
          <p className="mt-1 text-sm font-medium text-[#68779f]">Imported into temporary queue</p>
        </div>
        <div className="rounded-lg border border-[#dfe7f2] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <FiDatabase aria-hidden="true" className="text-[#d97706]" size={22} />
            <p className="text-sm font-bold text-[#68779f]">Patient&apos;s Info Pending</p>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-[#d97706]">{pendingCount}</p>
          <p className="mt-1 text-sm font-medium text-[#68779f]">Records waiting for completion</p>
        </div>
        <div className="rounded-lg border border-[#dfe7f2] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <FiCheckCircle aria-hidden="true" className="text-[#059669]" size={22} />
            <p className="text-sm font-bold text-[#68779f]">Completed Records</p>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-[#059669]">{completedCount}</p>
          <p className="mt-1 text-sm font-medium text-[#68779f]">Saved patient test records</p>
        </div>
      </div>

      <PatientTable
        isSearchActive={Boolean(searchQuery.trim()) || activeFilter !== 'All Records'}
        onDeleteRecord={setDeletingRecord}
        onEditMetadata={setEditingRecord}
        onViewAnalysis={handleViewAnalysis}
        records={filteredRecords}
      />

      <ImportPreviewModal
        isOpen={isImportPreviewOpen}
        onClose={() => setIsImportPreviewOpen(false)}
        onImport={handleStartImport}
      />
      <ImportProgressModal
        isOpen={isImportProgressOpen}
        onClose={() => {
          setIsImportProgressOpen(false);
          setImportButtonState('ready');
        }}
      />
      <PatientMetadataModal
        isOpen={Boolean(editingRecord)}
        onClose={() => setEditingRecord(null)}
        onSave={handleSaveMetadata}
        record={editingRecord}
      />
      <PatientAnalysisModal
        isOpen={Boolean(analysisRecord)}
        onClose={() => setAnalysisRecord(null)}
        record={analysisRecord}
      />

      {deletingRecord ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-[#dfe7f2] bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
            <h2 className="text-lg font-extrabold text-[#07194c]">{deletingRecord.recordId ? 'Delete Record' : 'Remove Import'}</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-[#68779f]">
              {deletingRecord.recordId
                ? `Delete patient test "${deletingRecord.patientName || deletingRecord.id}"? This will permanently remove the record and analysis file.`
                : `Remove imported TXT "${deletingRecord.id}" from this list? It has not been saved to the database yet.`}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="h-10 rounded-md border border-[#d7deea] bg-white px-4 text-sm font-bold text-[#07194c] transition hover:bg-[#f8fbff]"
                onClick={() => setDeletingRecord(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-10 rounded-md bg-red-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
                onClick={handleConfirmDelete}
                type="button"
              >
                {deletingRecord.recordId ? 'Delete' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
