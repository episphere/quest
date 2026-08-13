import AxeBuilder from '@axe-core/playwright';

function normalizeTarget(target) {
  return Array.isArray(target) ? target.map(String) : [String(target)];
}

function findingKey({ id, impact, target }) {
  return JSON.stringify([id, impact, normalizeTarget(target)]);
}

export async function analyzeQuestAxe(page) {
  const results = await new AxeBuilder({ page })
    .include('#questionnaireRoot')
    .analyze();

  return results.violations.flatMap((violation) => (
    violation.nodes.map((node) => ({
      id: violation.id,
      impact: violation.impact,
      target: normalizeTarget(node.target),
    }))
  ));
}

export function matchesAxeDefect(finding, defect) {
  return defect.targets.some((target) => findingKey(finding) === findingKey({
    id: defect.ruleId,
    impact: defect.impact,
    target,
  }));
}

export function unwaivedAxeFindings(findings, acceptedDefects) {
  return findings.filter((finding) => (
    !acceptedDefects.some((defect) => matchesAxeDefect(finding, defect))
  ));
}
