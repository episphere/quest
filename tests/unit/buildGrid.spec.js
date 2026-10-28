import { describe, expect, it } from 'vitest';
import { parseGrid } from '../../buildGrid.js';

const buttons = '<div class="question-buttons"><button class="next">Next</button></div>';

describe('parseGrid', () => {
  it('renders a semantic radio grid with encoded conditions and piped values', () => {
    const html = parseGrid(
      '|grid?|id=GRID displayif=equals(ELIGIBLE,1)|Shared {$name} %displayif=equals(A,1)%conditional%|[ROW1]First {$u:firstName};[ROW2,displayif=equals(SHOW,1)]Second;|(1:Yes)(0:No)|',
      buttons,
    );
    const template = document.createElement('template');
    template.innerHTML = html;
    const form = template.content.querySelector('form');

    expect(form.id).toBe('GRID');
    expect(form.getAttribute('softedit')).toBe('true');
    expect(form.dataset.grid).toBe('true');
    expect(decodeURIComponent(form.getAttribute('displayif'))).toBe('equals(ELIGIBLE,1)');
    expect(form.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(form.querySelectorAll('input[type="radio"]')).toHaveLength(4);
    expect(form.querySelector('#srFocusHelper')).toBeNull();
    const cornerSpacer = form.querySelector('thead tr > :first-child');
    expect(cornerSpacer.tagName).toBe('TD');
    expect(cornerSpacer.classList.contains('grid-corner-spacer')).toBe(true);
    expect(cornerSpacer.textContent).toBe('');
    expect(form.querySelectorAll('thead th:not([scope="col"])')).toHaveLength(0);
    expect(form.querySelectorAll('table.quest-grid [role]')).toHaveLength(0);
    expect(form.querySelector('#ROW1_0').value).toBe('1');
    expect(form.querySelector('#ROW1_0').hasAttribute('aria-labelledby')).toBe(false);
    expect(form.querySelector('#ROW2_1').hasAttribute('aria-labelledby')).toBe(false);
    expect(form.querySelector('#ROW1_0').labels).toHaveLength(1);
    expect(form.querySelector('#ROW1_0').labels[0].id).toBe('labelROW1_0');
    expect(form.querySelector('#qtextROW1').textContent).toContain('First');
    expect(form.querySelector('#labelROW1_0 .grid-label-row-context').textContent).toBe('');
    expect(
      form.querySelector('#labelROW1_0 .grid-label-row-context').classList.contains('visually-hidden'),
    ).toBe(true);
    expect(form.querySelector('#labelROW1_0 .grid-label-response-text').textContent).toBe('Yes');
    expect(form.querySelector('#labelROW1_0').textContent).toBe('Yes');
    expect(form.querySelector('#labelROW1_0 [data-gridreplace="firstName"]')).toBeNull();
    expect(form.querySelector('span[data-gridreplace="name"]')).not.toBeNull();
    expect(form.querySelector('span[data-gridreplace="firstName"]')).not.toBeNull();
    expect(form.querySelector('.grid-displayif')).not.toBeNull();
    const conditionalRow = form.querySelector('[data-displayif]');
    expect(conditionalRow.dataset.displayif).toBe('equals(SHOW%2C1)');
    expect(decodeURIComponent(conditionalRow.dataset.displayif)).toBe('equals(SHOW,1)');
    expect(conditionalRow.dataset.displayif).not.toContain('%25');
    expect(form.querySelector('.question-buttons')).not.toBeNull();
  });

  it('renders checkbox grids and hard-edit prompts', () => {
    const html = parseGrid(
      '|grid!|id=CHECKGRID|Choose all|[ROW]A row;|[A:Alpha][B:Beta]|',
      buttons,
    );
    const template = document.createElement('template');
    template.innerHTML = html;
    const form = template.content.querySelector('form');

    expect(form.getAttribute('hardedit')).toBe('true');
    expect(form.getAttribute('softedit')).toBe('false');
    expect(form.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(form.querySelectorAll('th[scope="col"]')).toHaveLength(2);
    expect(form.querySelector('th[scope="row"]').textContent).toContain('A row');
    expect(form.querySelector('#ROW_0').hasAttribute('aria-labelledby')).toBe(false);
    expect(form.querySelector('#ROW_1').hasAttribute('aria-labelledby')).toBe(false);
    expect(form.querySelector('#ROW_0').labels).toHaveLength(1);
    expect(form.querySelector('#labelROW_0 .grid-label-row-context').textContent).toBe('');
    expect(form.querySelector('#labelROW_0 .grid-label-response-text').textContent).toBe('Alpha');
    expect(form.querySelector('#labelROW_1').textContent).toBe('Beta');
  });

  it('uses a plain prompt when no edit marker is present', () => {
    const html = parseGrid('|grid|id=PLAIN|Question|[ROW]Text;|(1:One)|', buttons);
    const template = document.createElement('template');
    template.innerHTML = html;
    const form = template.content.querySelector('form');

    expect(form.getAttribute('hardedit')).toBe('false');
    expect(form.getAttribute('softedit')).toBe('false');
    expect(form.querySelector('thead [data-header="One"]')).not.toBeNull();
  });

  it('makes evaluated piped values distinguishable from response lookups', () => {
    const html = parseGrid('|grid|id=PIPED|{$e:1 + 1}|[ROW]{$answer};|(1:One)|', buttons);
    const template = document.createElement('template');
    template.innerHTML = html;

    expect(template.content.querySelector('[data-gridreplacetype="eval"]')).not.toBeNull();
    expect(template.content.querySelector('[data-gridreplacetype="_val"]')).not.toBeNull();
  });

  it('encodes production-style quoted row conditions exactly once', () => {
    const condition = 'valueOrDefault("AGE","DEFAULT")>=18 and someSelected("ROW_1","ROW_2")';
    const html = parseGrid(
      `|grid|id=CONDITIONAL|Question|[ROW,displayif=${condition}]Text;|(1:One)|`,
      buttons,
    );
    const template = document.createElement('template');
    template.innerHTML = html;
    const serializedCondition = template.content.querySelector('[data-displayif]').dataset.displayif;

    expect(serializedCondition).toBe(encodeURIComponent(condition));
    expect(decodeURIComponent(serializedCondition)).toBe(condition);
    expect(serializedCondition).not.toContain('%25');
  });
});
