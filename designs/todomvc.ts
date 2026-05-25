// designs/todomvc.ts — the public TodoMVC design encoded as the article's
// reference example. The shape mirrors what a Figma export would carry into
// the pipeline. Source: https://todomvc.com/ (public reference application).
//
// This is intentionally minimal — we encode only what a sparse design
// artifact would have, so the enrichment stage has implicit constraints to
// surface. A richer Figma export would make the baseline easier.
//
// MIT License.

import { DesignArtifact } from '../types';

export const TODOMVC_DESIGN: DesignArtifact = {
  id: 'todomvc-public-1',
  name: 'TodoMVC',
  body: {
    description:
      'A single-page todo list application, used as a public reference for evaluating frontend frameworks. See https://todomvc.com.',
    screens: [
      {
        name: 'Main',
        components: [
          {
            type: 'header',
            text: 'todos',
          },
          {
            type: 'input',
            id: 'new-todo',
            placeholder: 'What needs to be done?',
            interactions: ['enter to submit'],
          },
          {
            type: 'list',
            id: 'todo-list',
            itemType: 'todo-item',
            itemComponents: [
              { type: 'checkbox', purpose: 'mark complete' },
              { type: 'label', purpose: 'todo text' },
              { type: 'button', purpose: 'destroy', visibility: 'on hover' },
            ],
          },
          {
            type: 'footer',
            visibility: 'when at least one todo exists',
            components: [
              { type: 'count', text: 'N items left' },
              {
                type: 'filters',
                options: ['All', 'Active', 'Completed'],
                purpose: 'filter the list',
              },
              {
                type: 'button',
                id: 'clear-completed',
                text: 'Clear completed',
                visibility: 'when at least one completed todo exists',
              },
            ],
          },
        ],
      },
    ],
    reference: 'https://todomvc.com/',
  },
};
