import type { ReactNode } from "react";

interface ModalProps {
  children: ReactNode;
  closeDisabled?: boolean;
  title: string;
  onClose: () => void;
}

export function Modal(props: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel" aria-modal="true" role="dialog" aria-labelledby="modal-title">
        <div className="modal-heading">
          <h2 id="modal-title">{props.title}</h2>
          {props.closeDisabled ? null : (
            <button className="icon-button" onClick={props.onClose} type="button">
              닫기
            </button>
          )}
        </div>
        {props.children}
      </section>
    </div>
  );
}
