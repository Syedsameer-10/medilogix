import { FiActivity, FiChevronDown, FiChevronUp, FiEdit3, FiFileText, FiTrash2 } from 'react-icons/fi';
import type { PatientTestRecord } from '../../types/patientTest';
import { cn } from '../../utils/cn';

interface PatientTableProps {
  isSearchActive?: boolean;
  onDeleteRecord: (record: PatientTestRecord) => void;
  onEditMetadata: (record: PatientTestRecord) => void;
  onViewAnalysis: (record: PatientTestRecord) => void;
  records: PatientTestRecord[];
}

const columns = ['Patient ID', 'Patient Name', 'Case History', 'Test Date', 'Test Duration', 'Edit', 'Actions'];

function SortIcon() {
  return (
    <span className="ml-2 inline-flex translate-y-[1px] flex-col text-[#07194c]">
      <FiChevronUp aria-hidden="true" size={11} />
      <FiChevronDown aria-hidden="true" className="-mt-1" size={11} />
    </span>
  );
}

function StatusBadge({ status }: { status: PatientTestRecord['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center rounded-full px-3 text-sm font-bold ring-1',
        status === 'Completed'
          ? 'bg-[#dff4e8] text-[#008035] ring-emerald-200'
          : 'bg-[#fff3dd] text-[#d97706] ring-amber-200',
      )}
    >
      {status}
    </span>
  );
}

export function PatientTable({ isSearchActive = false, onDeleteRecord, onEditMetadata, onViewAnalysis, records }: PatientTableProps) {
  if (records.length === 0) {
    return (
      <section className="rounded-xl border border-[#dfe7f2] bg-white px-6 py-14 text-center shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-[#eef4ff] text-[#0647ff] shadow-inner">
          <FiFileText aria-hidden="true" size={36} />
        </div>
        <h2 className="mt-6 text-2xl font-extrabold tracking-normal text-[#07194c]">
          {isSearchActive ? 'No Matching Patient Records' : 'No Patient Records Found'}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-base font-medium leading-7 text-[#68779f]">
          {isSearchActive
            ? 'Try another patient ID, name, test date, case history, status, or age.'
            : 'Connect the laboratory device and import patient test files to begin.'}
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[#dfe7f2] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1160px] text-left text-[15px] text-[#07194c]">
          <thead className="bg-[#f7faff]">
            <tr>
              {columns.map((column) => (
                <th
                  className={cn(
                    'h-[58px] whitespace-nowrap border-b border-[#e2e9f3] px-6 text-xs font-extrabold uppercase tracking-[0.08em] text-[#56658c]',
                    column === 'Actions' && 'text-right',
                  )}
                  key={column}
                >
                  <span className={cn('inline-flex items-center', column === 'Actions' && 'justify-end')}>
                    {column}
                    {column !== 'Actions' ? <SortIcon /> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr className="border-b border-[#e7ebf3] transition last:border-b-0 hover:bg-[#f8fbff]" key={record.recordKey ?? record.recordId ?? record.id}>
                <td className="h-16 whitespace-nowrap px-6">
                  <span className="inline-flex rounded-md bg-[#eef4ff] px-2.5 py-1 text-sm font-extrabold text-[#0647ff]">
                    {record.id}
                  </span>
                </td>
                <td className="h-16 whitespace-nowrap px-6 font-medium">
                  {record.patientName || <span className="text-[#8a97bc]">Patient&apos;s Info pending</span>}
                </td>
                <td className="h-16 whitespace-nowrap px-6 font-medium">
                  {record.caseHistory || <span className="text-[#8a97bc]">Pending</span>}
                </td>
                <td className="h-16 whitespace-nowrap px-6 font-medium">{record.testDate}</td>
                <td className="h-16 whitespace-nowrap px-6 font-medium">{record.testDuration}</td>
                <td className="h-16 whitespace-nowrap px-6">
                  <StatusBadge status={record.status} />
                </td>
                <td className="h-16 whitespace-nowrap px-6">
                  <div className="flex justify-end gap-2">
                    <button
                      aria-label={`Edit Patient's Info for patient ${record.id}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d7deea] bg-white text-[#07194c] shadow-sm transition hover:border-[#0647ff] hover:bg-[#eef4ff] hover:text-[#0647ff]"
                      onClick={() => onEditMetadata(record)}
                      title="Edit Patient's Info"
                      type="button"
                    >
                      <FiEdit3 aria-hidden="true" size={16} />
                    </button>
                    <button
                      aria-label={`View analysis for patient ${record.id}`}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#0647ff] px-3 text-sm font-bold text-white shadow-[0_10px_18px_rgba(6,71,255,0.22)] transition hover:bg-[#053ee0]"
                      onClick={() => onViewAnalysis(record)}
                      title="View Analysis"
                      type="button"
                    >
                      <FiActivity aria-hidden="true" size={16} />
                      <span>View Analysis</span>
                    </button>
                    <button
                      aria-label={`Delete patient ${record.id}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 shadow-sm transition hover:border-red-400 hover:bg-red-50"
                      onClick={() => onDeleteRecord(record)}
                      title="Delete Record"
                      type="button"
                    >
                      <FiTrash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
