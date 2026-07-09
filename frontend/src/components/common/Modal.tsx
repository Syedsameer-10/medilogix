import type { ReactNode } from 'react';
import { FiX } from 'react-icons/fi';

interface ModalProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  scrollable?: boolean;
  size?: 'md' | 'xl';
  title: ReactNode;
}

const sizeClasses = {
  md: 'max-w-2xl',
  xl: 'max-w-6xl',
};

export function Modal({ children, isOpen, onClose, scrollable = true, size = 'md', title }: ModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#07194c]/35 px-4 py-6 backdrop-blur-sm">
      <section className={`max-h-[92vh] w-full overflow-hidden rounded-xl bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)] ${sizeClasses[size]}`}>
        <header className="flex items-center justify-between border-b border-[#e7ebf3] px-6 py-5">
          <h2 className="text-xl font-extrabold tracking-normal text-[#07194c]">{title}</h2>
          <button
            aria-label="Close modal"
            className="grid h-10 w-10 place-items-center rounded-lg text-[#52628f] transition hover:bg-[#f6f8fb]"
            onClick={onClose}
            type="button"
          >
            <FiX aria-hidden="true" size={22} />
          </button>
        </header>
        <div className={scrollable ? 'max-h-[calc(92vh-82px)] overflow-y-auto p-6' : 'p-6'}>{children}</div>
      </section>
    </div>
  );
}
