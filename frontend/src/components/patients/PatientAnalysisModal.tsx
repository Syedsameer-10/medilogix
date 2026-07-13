import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import medilogixLogo from '../../assets/medilogix-logo.png';
import senstimLogo from '../../assets/senstim-logo.jpeg';
import { useAuth } from '../../contexts/AuthContext';
import type { PatientTestRecord } from '../../types/patientTest';
import { Card } from '../common/Card';
import { Modal } from '../common/Modal';

interface PatientAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: PatientTestRecord | null;
}

export function PatientAnalysisModal({ isOpen, onClose, record }: PatientAnalysisModalProps) {
  const { doctor } = useAuth();

  if (!record) {
    return null;
  }

  const hospitalLogo = doctor?.hospitalLogoUrl || medilogixLogo;
  const patientDetails = [
    { label: 'Patient ID', value: record.id },
    { label: 'Patient Name', value: record.patientName || "Patient's Info pending" },
    { label: 'Test Date', value: record.testDate },
    { label: 'Case History', value: record.caseHistory || "Patient's Info pending" },
  ];

  const modalTitle = (
    <div className="flex items-center gap-3">
      <span>Pressure Graph</span>
      <span className="h-6 border-l-2 border-[#e7ebf3]"></span>
      <img alt="Sen Stim Logo" className="h-8 object-contain" src={senstimLogo} />
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} scrollable={false} size="xl" title={modalTitle}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-8 rounded-lg border border-[#e7ebf3] bg-[#f8fbff] px-4 py-3">
          <div className="grid min-w-0 max-w-[760px] flex-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {patientDetails.map((detail) => (
              <div className="min-w-0" key={detail.label}>
                <p className="text-[10px] font-extrabold uppercase tracking-normal text-[#68779f]">{detail.label}</p>
                <p className="mt-0.5 truncate text-sm font-extrabold text-[#07194c]">{detail.value}</p>
              </div>
            ))}
          </div>
          <div className="min-w-[160px] rounded-lg border border-[#dfe7f2] bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-extrabold tracking-normal text-[#68779f]">mA</p>
            <p className="mt-2 text-sm font-extrabold text-[#07194c]">{record.stimulationCurrentMa || '--'}</p>
          </div>
          <div className="ml-auto flex min-w-[160px] items-center justify-end border-l border-[#dfe7f2] pl-8">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-[#dfe7f2] bg-white p-3 shadow-sm">
              <img alt={`${doctor?.name ?? 'Hospital'} logo`} className="max-h-14 max-w-14 object-contain" src={hospitalLogo} />
            </div>
          </div>
        </div>

        <Card className="bg-[#eef9f1] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-extrabold text-[#07194c]">PSI Readings</h3>
            </div>
          </div>
          <div className="h-[300px] w-full rounded-xl bg-[#e7f6eb] p-2">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart data={record.samples} margin={{ bottom: 12, left: 0, right: 16, top: 12 }}>
                <CartesianGrid stroke="#cbe8d2" strokeDasharray="5 5" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: '#52628f', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#52628f', fontSize: 12 }} tickLine={false} axisLine={false} width={42} />
                <Tooltip />
                <Line
                  dataKey="psi"
                  dot={{ fill: '#1D4ED8', r: 2.5 }}
                  name="PSI"
                  stroke="#1D4ED8"
                  strokeWidth={2}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </Modal>
  );
}
