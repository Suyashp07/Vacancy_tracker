'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Field, StatefulForm } from '@/components/stateful-form';
import { createVacancyRequest } from '@/server/actions';
import { VACANCY_REASONS } from '@/lib/constants';

/**
 * Raising a vacancy request. The field set is deliberately short: everything
 * the Owner needs in order to say yes or no, and nothing that belongs to the
 * candidate stage. Personal data of any kind is asked for later, elsewhere.
 */
export function NewRequestForm({
  facilities,
  acknowledgementVersion,
  acknowledgementTitle,
}: {
  facilities: { id: string; name: string; code: string }[];
  acknowledgementVersion: string;
  acknowledgementTitle: string;
}) {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="fcard">
      <div className="card">
        <StatefulForm
          action={createVacancyRequest}
          label="Submit for vacancy approval"
          intro="Submitting sends the request to the Owner or CEO for approval. Nothing here is visible to a candidate, because no candidate exists yet."
        >
          <div className="formsec">The vacancy</div>
          <div className="fgrid">
            <div className="full">
              <Field name="title" label="Position title" required placeholder="e.g. Two-wheeler assembly operator — Line 3" />
            </div>
            <Field
              name="facility_id"
              label="Facility"
              required
              options={facilities.map((f) => ({ value: f.id, label: `${f.name} (${f.code})` }))}
            />
            <Field name="position_type" label="Role / job family" required placeholder="Operator, Supervisor, QA…" />
            <Field
              name="reason"
              label="Reason for the vacancy"
              required
              options={VACANCY_REASONS.map((r) => ({ value: r, label: r }))}
            />
            <div className="field">
              <label htmlFor="quantity" className="req">
                How many positions
              </label>
              <div className="qty">
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  className="input"
                  min={1}
                  max={50}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                />
                <span className="tiny muted">
                  creates {quantity} separate position record{quantity === 1 ? '' : 's'}, each tracked and approved on its
                  own
                </span>
              </div>
            </div>
            <Field name="min_qualification" label="Minimum qualification" placeholder="ITI Diploma, Electrical" />
            <Field name="experience_text" label="Experience needed" placeholder="2+ years on an assembly line" />
          </div>

          <div className="fgrid" style={{ marginTop: 14 }}>
            <Field
              name="previous_employee_name"
              label="Who left this seat"
              placeholder="Employee number or name — replacements only"
              hint="A reference only. Their service records stay in HRMS, not in this portal."
            />
            <Field name="backfill_ref_note" label="Backfill reference" placeholder="Resignation date, transfer order…" />
          </div>

          <div className="formsec">Cost and timing</div>
          <div className="fgrid">
            <div className="full">
              <div className="fsplit">
                <Field name="ctc_min" label="CTC floor (₹ / month)" type="number" min={0} placeholder="26000" />
                <span className="dash" aria-hidden>
                  –
                </span>
                <Field name="ctc_max" label="CTC ceiling (₹ / month)" type="number" min={0} placeholder="34000" />
              </div>
              <span className="hint">
                Finance reviews the band. A ceiling can only be raised later by a recorded, audited adjustment.
              </span>
            </div>
            <Field
              name="budget_available"
              label="Is the budget already approved?"
              type="select"
              options={[
                { value: 'on', label: 'Yes — headcount is funded' },
                { value: 'off', label: 'No — needs budget review' },
              ]}
            />
            <Field name="target_fill_date" label="Target fill date" type="date" />
            <div className="full field">
              <label className="checkline" htmlFor="is_urgent">
                <input id="is_urgent" type="checkbox" name="is_urgent" />
                <span>
                  Mark as urgent
                  <span className="hint" style={{ display: 'block' }}>
                    Urgency shortens nobody&apos;s SLA. It puts the request at the top of the approver&apos;s queue and
                    stays on the record.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="formsec">Why this must exist</div>
          <Field
            name="justification"
            label="Business justification"
            rows={4}
            required
            placeholder="What breaks if this seat stays empty, and what it costs. This is the text the approver reads first."
            hint="At least 20 characters. It is retained after the position closes."
          />

          <div className="formsec">Before you submit</div>
          <label className="ack" htmlFor="acknowledgement_accepted">
            <input id="acknowledgement_accepted" type="checkbox" name="acknowledgement_accepted" required />
            <span>
              I confirm this request contains no personal data about candidates, and I have read{' '}
              <Link href="/legal" className="link">
                {acknowledgementTitle}
              </Link>{' '}
              version {acknowledgementVersion}. Data collected about a person later is disclosed to them on request.
            </span>
          </label>
          <input type="hidden" name="acknowledgement_version" value={acknowledgementVersion} />
        </StatefulForm>
      </div>

      <p className="tiny muted" style={{ marginTop: 16, maxWidth: '78ch' }}>
        Drafts are not implemented as a separate state: submitting is a single decision, and the request goes straight
        to the approver whose name and queue it will appear in. If you need to stop it, do so before the approval -
        once approved, only a recorded adjustment can change the terms.
      </p>
    </div>
  );
}
