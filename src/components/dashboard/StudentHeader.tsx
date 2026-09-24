"use client";
import styles from "./StudentHeader.module.css";

interface Props {
  studentName: string | null;
  lastImportAt: string | null;
  uploadSlot?: React.ReactNode;
}

export default function StudentHeader({ studentName, lastImportAt, uploadSlot }: Props) {
  const title = studentName
    ? `Dashboard de Notas · ${studentName}`
    : "Dashboard de Notas";

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.sub}>
          Inteli - Cálculo de notas do módulo
          {lastImportAt && (
            <span className={styles.ts}>
              {" "}· {new Date(lastImportAt).toLocaleString("pt-BR")}
            </span>
          )}
        </p>
      </div>
      {uploadSlot && <div className={styles.right}>{uploadSlot}</div>}
    </header>
  );
}
