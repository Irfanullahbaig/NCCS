"use client";

import { useState } from "react";
import { restoreLateFeeAction, waiveLateFeeAction } from "@/actions/finance";
import { saveLateFeeSettingsAction } from "@/actions/users";
import { Modal, useSubmit } from "@/components/forms";
import { Button, ErrorText, Field, Input, Textarea } from "@/components/ui";
import { formatPKR } from "@/lib/utils";

const QUICK_REASONS = ["Paid on time at the bank", "Approved by principal", "Family hardship", "Entered by mistake"];

/** Fine column: shows the late fee and, for allowed roles, waive / undo controls. */
export function LateFeeCell({
  feeRecordId,
  fine,
  fineWaived,
  reason,
  label,
  canWaive,
}: {
  feeRecordId: string;
  fine: number;
  fineWaived?: boolean | null;
  reason?: string | null;
  label: string;
  canWaive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { pending, submit } = useSubmit();

  if (fineWaived) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20" title={reason ?? undefined}>
          Late fee waived
        </span>
        {canWaive ? (
          <button
            type="button"
            disabled={pending}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-navy hover:underline disabled:opacity-50"
            onClick={async () => {
              if (!confirm(`Charge the late fee again for ${label}?`)) return;
              const formData = new FormData();
              formData.set("feeRecordId", feeRecordId);
              await submit(restoreLateFeeAction, formData, "Late fee restored");
            }}
          >
            Undo
          </button>
        ) : null}
      </span>
    );
  }

  if (!fine) return <span className="text-slate-400">—</span>;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{formatPKR(fine)}</span>
      {canWaive ? (
        <>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:border-teal hover:text-teal"
            onClick={() => setOpen(true)}
          >
            Waive
          </button>
          <WaiveLateFeeModal open={open} onClose={() => setOpen(false)} feeRecordId={feeRecordId} fine={fine} label={label} />
        </>
      ) : null}
    </span>
  );
}

function WaiveLateFeeModal({
  open,
  onClose,
  feeRecordId,
  fine,
  label,
}: {
  open: boolean;
  onClose: () => void;
  feeRecordId: string;
  fine: number;
  label: string;
}) {
  const { error, pending, submit } = useSubmit();
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={`Waive late fee — ${label}`}>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(waiveLateFeeAction, new FormData(event.currentTarget), "Late fee waived", onClose);
        }}
      >
        <input type="hidden" name="feeRecordId" value={feeRecordId} />
        <p className="text-sm text-slate-600">
          This removes the {formatPKR(fine)} late fee for this month and stops it from being charged again. The waiver and its reason are saved in the audit log. You can undo it later.
        </p>
        <Field label="Reason">
          <Textarea name="reason" value={reason} onChange={(event) => setReason(event.target.value)} required autoFocus />
        </Field>
        <div className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setReason(item)}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200"
            >
              {item}
            </button>
          ))}
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending || !reason.trim()}>{pending ? "Saving..." : "Waive late fee"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function LateFeeSettingsForm({
  chargeOnPartial,
  startMonth,
  amount,
  day,
}: {
  chargeOnPartial: boolean;
  startMonth: string;
  amount: number;
  day: number;
}) {
  const { error, pending, submit } = useSubmit();
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await submit(saveLateFeeSettingsAction, new FormData(event.currentTarget), "Late fee settings saved");
      }}
    >
      <p className="text-sm text-slate-600">
        A {formatPKR(amount)} late fee is added once per month when the fee is not paid by the {day}th. Students who join after the {day}th are not charged for their first month.
      </p>
      <Field label="Start charging late fees from">
        <Input type="month" name="lateFeeStartMonth" defaultValue={startMonth} required />
      </Field>
      <p className="-mt-2 text-xs text-slate-500">Earlier fee months never get a late fee. Any late fee already on them is removed.</p>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="lateFeeChargeOnPartial" defaultChecked={chargeOnPartial} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal focus:ring-teal" />
        <span>
          <span className="font-medium text-navy">Charge the late fee on partial payments</span>
          <span className="block text-xs text-slate-500">
            When off, a student who paid part of the fee by the {day}th is not charged the late fee.
          </span>
        </span>
      </label>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending}>{pending ? "Saving and recalculating..." : "Save late fee settings"}</Button>
    </form>
  );
}
