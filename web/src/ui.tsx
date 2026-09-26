import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowUpRight,
  Coffee,
  House,
  Leaf,
  PlugZap,
  ShoppingBasket,
  TrainFront,
  X,
} from "lucide-react";
import { initials } from "./types";

export const categoryIcon = (category: string) =>
  ({
    Home: House,
    Groceries: ShoppingBasket,
    Utilities: PlugZap,
    Transport: TrainFront,
    Other: Coffee,
  })[category] || Leaf;
export function CategoryIcon({ category }: { category: string }) {
  const Icon = categoryIcon(category);
  return (
    <span className={"category-icon " + category.toLowerCase()}>
      <Icon size={19} strokeWidth={1.7} />
    </span>
  );
}
export function Avatar({
  name,
  index = 0,
  small = false,
}: {
  name: string;
  index?: number;
  small?: boolean;
}) {
  return (
    <span
      title={name}
      className={`avatar color-${index % 4} ${small ? "small" : ""}`}
    >
      {initials(name)}
    </span>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <img src="/favicon.svg" alt="" />
      <span>
        commonroom<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Leaf size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">YOUR SHARED HOME</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function HouseArt() {
  return (
    <svg className="house-art" viewBox="0 0 360 220" aria-hidden="true">
      <ellipse cx="188" cy="196" rx="133" ry="13" fill="#d7dfb3" />
      <path d="M62 106 165 48 275 106 171 165Z" fill="#f1e9cb" />
      <path d="m62 106 109 59v-64L62 42Z" fill="#b8c995" />
      <path d="m171 165 104-59V42L171 101Z" fill="#d8e0b6" />
      <path d="m62 42 104-31 109 31-104 59Z" fill="#e9edcd" />
      <path
        d="m61 43 104 58 111-58"
        fill="none"
        stroke="#42654a"
        strokeWidth="2"
      />
      <path d="m91 75 28 15v39l-28-15Z" fill="#4a7155" />
      <path d="m200 96 29-16v39l-29 17Z" fill="#6e8c64" />
      <path
        d="m104 82 1 40m-13-22 26 14m97-27v39m-14-12 28-16"
        fill="none"
        stroke="#c8d5a8"
        strokeWidth="2"
      />
      <path d="m141 105 17 9v44l-17-9Z" fill="#f1e6be" />
      <path d="m245 73 16-9v27l-16 9Z" fill="#6e8c64" />
      <path d="m84 168 72 39 115-65-29-14-75 43-45-24Z" fill="#ece6cc" />
      <path d="M304 156v36m-6 0h12" stroke="#506b46" strokeWidth="3" />
      <path
        d="M304 173c-25-13-29-40-13-48 10-5 16 7 16 15 12-20 33-5 22 12-5 9-15 14-25 21Z"
        fill="#7d9b68"
      />
      <path d="M37 143v39m-7 0h14" stroke="#506b46" strokeWidth="3" />
      <path
        d="M37 155c-20-9-24-32-10-39 8-4 13 5 13 12 11-18 28-3 18 10-5 7-13 12-21 17Z"
        fill="#a2b982"
      />
      <circle cx="282" cy="33" r="14" fill="#ebd996" />
      <path d="m25 68 7-4m274 35 10-6" stroke="#93a47a" strokeWidth="2" />
    </svg>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
