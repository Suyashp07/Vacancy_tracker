'use client';

import { Field, StatefulForm } from '@/components/stateful-form';
import { addCandidate } from '@/server/actions';
import { PROHIBITED_DATA } from '@/lib/constants';

/**
 * A candidate record is created here and nowhere else, which is what lets the
 * portal state a single, hard guarantee: the person has been told. The notice
 * checkbox is not a formality - the action refuses without it, and the DPDP
 * purpose note is stored beside the record.
 */
export function AddCandidateForm({
  requestId,
  positionId,
  positionLabel,
}: {
  requestId: string;
  positionId: string;
  positionLabel: string;
}) {
  return (
    <StatefulForm
      action={addCandidate}
      label="Add candidate"
      resetOnSuccess
      intro={`Adding a name to ${positionLabel}. Nothing here is visible to anyone outside the facility scope, and the record can be deleted on request.`}
    >
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="position_id" value={positionId} />

      <div className="fgrid">
        <Field name="full_name" label="Candidate name" required placeholder="As they wrote it on their CV" />
        <Field name="current_location" label="Current location" placeholder="Pune, Camp" />
        <Field name="email" label="Email" type="email" placeholder="only if they shared it" />
        <Field name="phone" label="Phone" type="tel" placeholder="only if they shared it" />
        <Field name="expected_ctc" label="Expected CTC (₹ / month)" type="number" min={0} />
        <Field name="notice_period_days" label="Notice period (days)" type="number" min={0} max={365} />
        <div className="full">
          <Field name="qualifications" label="Qualifications" placeholder="ITI Electrical, 2019" rows={2} />
        </div>
        <div className="full">
          <Field name="experience_text" label="Experience" placeholder="3 years on a two-wheeler assembly line" rows={2} />
        </div>
        <Field name="source" label="Where they came from" placeholder="Walk-in, referrer, portal" />
      </div>

      <div className="ack">
        <input id={`notice-${positionId}`} type="checkbox" name="notice_acknowledged" required />
        <label htmlFor={`notice-${positionId}`}>
          <b>Told them.</b> The candidate has been informed that their name, contact details, CV and photograph are
          being collected for this specific position, that they may ask for it all at any time, and that unsuccessful
          data is deleted on a clock.
        </label>
      </div>

      <div className="notice warn">
        <div>
          Never enter these, even if the candidate offers them: {PROHIBITED_DATA.join(', ')}. This system has no
          purpose for them, and collecting data without a purpose is the failure DPDP is written about.
        </div>
      </div>
    </StatefulForm>
  );
}
