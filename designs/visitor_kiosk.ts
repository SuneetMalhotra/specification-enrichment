// designs/visitor_kiosk.ts — synthetic enterprise visitor check-in kiosk
// design used as the second application for the Specification Enrichment
// evaluation. Unlike TodoMVC (a well-known public reference application
// likely present in pretraining data), this is a plausible-but-novel
// corporate kiosk specification authored for this study. Its purpose is
// to disentangle the enrichment stage's contribution from any benefit
// the baseline pipeline gets from the model having memorized the
// reference application during pretraining.
//
// The explicit surface is intentionally sparse — only the on-screen
// elements and primary user flow are described. Implicit constraints
// (offline-sync, accessibility, badge-printer failure, host-notification
// timing, after-hours behavior, photo retention/GDPR, network failure
// recovery, duplicate check-in, language toggle, etc.) are deliberately
// omitted so the enrichment stage has implicit constraints to surface.
//
// MIT License.

import { DesignArtifact } from '../types';

export const VISITOR_KIOSK_DESIGN: DesignArtifact = {
  id: 'visitor-kiosk-v1',
  name: 'Corporate Visitor Check-In Kiosk',
  body: {
    description:
      'A tablet-based self-service kiosk in a corporate office lobby. Visitors check in by entering name, host employee email, and capturing a photo. The kiosk prints a temporary badge and notifies the host. The kiosk lives offline-capable with periodic sync to a backend visitor-management system.',
    screens: [
      {
        name: 'Welcome',
        components: [
          {
            type: 'header',
            text: 'company logo placeholder',
          },
          {
            type: 'button',
            id: 'check-in',
            text: 'Check In',
          },
          {
            type: 'button',
            id: 'pre-registered',
            text: 'Pre-registered? Enter code',
          },
        ],
      },
      {
        name: 'Visitor Details',
        components: [
          {
            type: 'form',
            id: 'visitor-details-form',
            fields: [
              { type: 'input', id: 'name', label: 'Name' },
              { type: 'input', id: 'host_email', label: 'Host employee email' },
              { type: 'input', id: 'company', label: 'Company' },
              {
                type: 'dropdown',
                id: 'purpose',
                label: 'Purpose',
                options: ['Meeting', 'Interview', 'Delivery', 'Other'],
              },
            ],
          },
        ],
      },
      {
        name: 'Photo Capture',
        components: [
          {
            type: 'viewfinder',
            id: 'camera-viewfinder',
            purpose: 'camera viewfinder placeholder',
          },
          { type: 'button', id: 'capture', text: 'Capture' },
          { type: 'button', id: 'retake', text: 'Retake' },
          { type: 'button', id: 'skip', text: 'Skip' },
        ],
      },
      {
        name: 'Confirmation',
        components: [
          { type: 'text', text: 'Welcome, {name}' },
          { type: 'text', text: 'Badge printing...' },
          { type: 'text', purpose: 'expected duration' },
        ],
      },
    ],
  },
};
