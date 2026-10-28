/**
 * Focus the first element that describes a modal without adding it to the
 * sequential Tab order. The modal templates make these static text elements
 * programmatically focusable with tabindex="-1".
 */
export function focusModalDescription(modalElement) {
    const descriptionIds = modalElement
        ?.getAttribute('aria-describedby')
        ?.trim()
        .split(/\s+/)
        .filter(Boolean) ?? [];
    const description = Array.from(modalElement?.querySelectorAll('[id]') ?? [])
        .find((element) => descriptionIds.includes(element.id));

    description?.focus({ preventScroll: true });
}
