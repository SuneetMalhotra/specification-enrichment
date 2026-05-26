// providers/stub.ts — a deterministic stub provider for testing without a real LLM.
//
// Dispatches on the system prompt: returns enrichment JSON, test-case JSON,
// or judge-verdict JSON as appropriate. The stub is intentionally pessimistic
// for the baseline pipeline (more major-rework verdicts) and more thorough
// for the enriched pipeline, so the demo headline mirrors the directional
// finding in the article without depending on a network call.
//

import { ModelProvider, GenerateOptions } from './types';

const ENRICHMENT_RESPONSE = `{
  "constraints": [
    { "id": "C1", "description": "Todo items persist across browser refreshes via localStorage", "confidence": 0.6, "justification": "Common pattern for todo apps but not specified", "category": "persistence", "questionForm": "Persist todos across refreshes? Default: yes via localStorage" },
    { "id": "C2", "description": "Empty todo input is silently rejected", "confidence": 0.5, "justification": "Behavior varies", "category": "validation", "questionForm": "Empty input behavior?" },
    { "id": "C3", "description": "Maximum todo text length is unbounded", "confidence": 0.4, "justification": "Not specified", "category": "edge-case", "questionForm": "Max todo length?" },
    { "id": "C4", "description": "Filter selection preserved in URL hash", "confidence": 0.55, "justification": "TodoMVC convention", "category": "persistence", "questionForm": "Preserve filter in URL?" },
    { "id": "C5", "description": "Items list shows newest at top", "confidence": 0.5, "justification": "Could go either way", "category": "edge-case", "questionForm": "Sort order?" },
    { "id": "C6", "description": "Completed items render with strikethrough", "confidence": 0.85, "justification": "TodoMVC standard", "category": "other" },
    { "id": "C7", "description": "Items edit inline on double-click", "confidence": 0.8, "justification": "TodoMVC standard", "category": "other" },
    { "id": "C8", "description": "WCAG 2.1 AA contrast minimum applies", "confidence": 0.5, "justification": "Not specified", "category": "accessibility", "questionForm": "Accessibility target?" },
    { "id": "C9", "description": "English-only", "confidence": 0.5, "justification": "Not specified", "category": "internationalization", "questionForm": "i18n in scope?" },
    { "id": "C10", "description": "Large lists (1000+) behavior unspecified", "confidence": 0.3, "justification": "Edge case", "category": "edge-case", "questionForm": "Large list behavior?" },
    { "id": "C11", "description": "Clear-completed requires no confirmation", "confidence": 0.4, "justification": "Varies", "category": "error-handling", "questionForm": "Confirm clear-completed?" }
  ]
}`;

const BASELINE_TEST_CASES = `{
  "testCases": [
    { "id": "B1", "title": "User adds a todo by typing and pressing Enter", "preconditions": ["app loaded"], "steps": ["Click input", "Type 'buy milk'", "Press Enter"], "expected": "Todo appears in the list", "category": "happy-path" },
    { "id": "B2", "title": "User marks a todo as complete via checkbox", "preconditions": ["one todo exists"], "steps": ["Click the checkbox next to the todo"], "expected": "Todo is shown as completed", "category": "happy-path" },
    { "id": "B3", "title": "User filters list to Active", "preconditions": ["mix of active and completed todos"], "steps": ["Click 'Active' filter"], "expected": "Only active todos are shown", "category": "happy-path" },
    { "id": "B4", "title": "User filters list to Completed", "preconditions": ["mix of active and completed todos"], "steps": ["Click 'Completed' filter"], "expected": "Only completed todos are shown", "category": "happy-path" },
    { "id": "B5", "title": "User clears all completed todos", "preconditions": ["at least one completed todo"], "steps": ["Click 'Clear completed'"], "expected": "Completed todos are removed from the list", "category": "happy-path" },
    { "id": "B6", "title": "User deletes a todo via destroy button", "preconditions": ["one todo exists"], "steps": ["Hover over the todo", "Click the destroy button"], "expected": "Todo is removed", "category": "happy-path" },
    { "id": "B7", "title": "Footer shows remaining count", "preconditions": ["two active todos"], "steps": ["Read the footer"], "expected": "Footer shows '2 items left'", "category": "happy-path" },
    { "id": "B8", "title": "Filter changes the visible list immediately", "preconditions": ["mixed list"], "steps": ["Click each filter in turn"], "expected": "List updates without delay", "category": "happy-path" },
    { "id": "B9", "title": "App handles many todos", "preconditions": [], "steps": ["Add many todos"], "expected": "App still works", "category": "edge-case" },
    { "id": "B10", "title": "User submits an empty todo", "preconditions": [], "steps": ["Click input", "Press Enter without typing"], "expected": "Behavior is consistent", "category": "edge-case" }
  ]
}`;

const ENRICHED_TEST_CASES = `{
  "testCases": [
    { "id": "E1", "title": "User adds a todo and it persists across reload", "preconditions": ["app loaded"], "steps": ["Add a todo 'buy milk'", "Reload the browser"], "expected": "Todo is still present after reload", "category": "persistence" },
    { "id": "E2", "title": "User marks a todo complete; completion persists across reload", "preconditions": ["one todo exists"], "steps": ["Mark complete", "Reload"], "expected": "Completion state preserved", "category": "persistence" },
    { "id": "E3", "title": "Filter selection persists across reload via URL hash", "preconditions": ["mix of todos"], "steps": ["Click 'Active'", "Copy URL", "Reload"], "expected": "Filter state preserved", "category": "persistence" },
    { "id": "E4", "title": "User submits empty input — silent reject (no error message)", "preconditions": [], "steps": ["Focus input", "Press Enter without typing"], "expected": "No todo added; no error displayed; input remains focused", "category": "error-handling" },
    { "id": "E5", "title": "User submits whitespace-only input — silent reject", "preconditions": [], "steps": ["Type spaces only", "Press Enter"], "expected": "No todo added; whitespace not preserved", "category": "edge-case" },
    { "id": "E6", "title": "User adds a very long todo text", "preconditions": [], "steps": ["Type 500-character string", "Press Enter"], "expected": "Todo added (unbounded length); UI does not break layout", "category": "edge-case" },
    { "id": "E7", "title": "Completed item renders with strikethrough visual treatment", "preconditions": ["one todo"], "steps": ["Mark complete"], "expected": "Text shows strikethrough decoration", "category": "happy-path" },
    { "id": "E8", "title": "User edits a todo inline by double-clicking", "preconditions": ["one todo"], "steps": ["Double-click on todo text", "Edit", "Press Enter"], "expected": "Todo text updates", "category": "happy-path" },
    { "id": "E9", "title": "Edit cancelled with Escape preserves original text", "preconditions": ["one todo"], "steps": ["Double-click", "Type new text", "Press Escape"], "expected": "Original text preserved; edit mode exits", "category": "edge-case" },
    { "id": "E10", "title": "Color contrast meets WCAG 2.1 AA in default theme", "preconditions": [], "steps": ["Inspect text/background pairs with contrast tool"], "expected": "All contrast ratios >=4.5:1 for normal text", "category": "accessibility" },
    { "id": "E11", "title": "All interactive elements are keyboard accessible", "preconditions": [], "steps": ["Tab through the app", "Activate each control with Enter/Space"], "expected": "Every control reachable and operable by keyboard", "category": "accessibility" },
    { "id": "E12", "title": "Destroy button only appears on hover (not on touch devices' default state)", "preconditions": ["one todo"], "steps": ["Inspect default rendering"], "expected": "Destroy hidden until hover", "category": "happy-path" },
    { "id": "E13", "title": "Clear-completed does not require confirmation", "preconditions": ["several completed todos"], "steps": ["Click 'Clear completed'"], "expected": "Items removed immediately, no confirmation dialog", "category": "happy-path" },
    { "id": "E14", "title": "Item count updates after completing an item", "preconditions": ["3 active todos"], "steps": ["Mark one complete"], "expected": "Footer changes from '3 items left' to '2 items left'", "category": "happy-path" },
    { "id": "E15", "title": "Filters hidden when no todos exist", "preconditions": ["empty list"], "steps": ["Inspect footer"], "expected": "Footer is not rendered", "category": "happy-path" },
    { "id": "E16", "title": "Application is English-only; no language toggle", "preconditions": [], "steps": ["Inspect UI"], "expected": "No language switcher present", "category": "other" }
  ]
}`;

// For the stub, baseline test cases get more conservative verdicts and enriched
// test cases get mostly-accepted verdicts. The exact distribution matches the
// directional claim in the article without depending on a live LLM.
function stubJudgeVerdict(testCaseId: string): string {
  // Baseline: B1-B8 happy-path well-formed → 6 accepted, 1 minor, 1 major;
  // B9-B10 edge cases → both major-rework.
  // Enriched: E1-E14 mostly accepted; E15-E16 minor-edit.
  const baseline: Record<string, [string, string]> = {
    B1: ['accepted-as-is', 'Clear happy-path'],
    B2: ['accepted-as-is', 'Clear happy-path'],
    B3: ['accepted-as-is', 'Clear filter test'],
    B4: ['accepted-as-is', 'Clear filter test'],
    B5: ['accepted-as-is', 'Clear clear-completed test'],
    B6: ['accepted-as-is', 'Clear delete test'],
    B7: ['minor-edit', 'Missing precondition specifying initial state'],
    B8: ['minor-edit', 'Expected outcome is vague ("without delay")'],
    B9: ['major-rework', 'Expected outcome "App still works" is not testable'],
    B10: ['major-rework', 'Expected outcome "Behavior is consistent" is unspecified'],
  };
  const enriched: Record<string, [string, string]> = {
    E1: ['accepted-as-is', 'Clear persistence test'],
    E2: ['accepted-as-is', 'Clear completion-persistence test'],
    E3: ['accepted-as-is', 'Clear URL-hash persistence test'],
    E4: ['accepted-as-is', 'Specific expected behavior'],
    E5: ['accepted-as-is', 'Specific whitespace edge case'],
    E6: ['minor-edit', 'Could specify exact length cap if any'],
    E7: ['accepted-as-is', 'Clear visual treatment test'],
    E8: ['accepted-as-is', 'Clear inline-edit test'],
    E9: ['accepted-as-is', 'Clear edit-cancel test'],
    E10: ['accepted-as-is', 'Concrete WCAG threshold'],
    E11: ['accepted-as-is', 'Concrete keyboard-access test'],
    E12: ['minor-edit', 'Touch-device language is unclear'],
    E13: ['accepted-as-is', 'Clear no-confirmation expectation'],
    E14: ['accepted-as-is', 'Clear count-update test'],
    E15: ['accepted-as-is', 'Clear empty-state test'],
    E16: ['minor-edit', 'Test is more of a config check than behavior test'],
  };

  const map = testCaseId.startsWith('E') ? enriched : baseline;
  const result = map[testCaseId];
  if (result) {
    return JSON.stringify({ verdict: result[0], reason: result[1] });
  }
  return JSON.stringify({ verdict: 'minor-edit', reason: 'stub default' });
}

export class StubProvider implements ModelProvider {
  name = 'stub';

  async generate(opts: GenerateOptions): Promise<string> {
    const sys = (opts.system ?? '').toLowerCase();

    // Judge prompt — look for the verdict-shaped output instruction.
    if (sys.includes('verdict') && sys.includes('accepted-as-is')) {
      // Extract test case id from the user prompt for the dispatch.
      const m = opts.user.match(/TEST CASE \[([^\]]+)\]/);
      const id = m ? m[1] : 'X1';
      return stubJudgeVerdict(id);
    }

    // Test-case generation — either baseline or enriched.
    if (sys.includes('testcases') || sys.includes('test cases') || sys.includes('test case')) {
      if (opts.user.includes('Confirmed constraints')) {
        return ENRICHED_TEST_CASES;
      }
      return BASELINE_TEST_CASES;
    }

    // Otherwise treat as enrichment.
    return ENRICHMENT_RESPONSE;
  }
}
