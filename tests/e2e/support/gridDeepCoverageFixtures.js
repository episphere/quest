// Production grid from locked questionnaire/module2.txt at
// 7ae99a22af325cf0e14be047a7636462db9bfd50. Retaining the source IDs and
// response values exercises the high-cardinality storage shape.
export const productionSleepGridMarkdown = `
{"name":"TEST_PRODUCTION_GRID"}
[GRID_LEAD] The next question uses a production response grid.
|grid?|id="D_981441822"|What is the chance that you would doze off or fall asleep (not just "feel tired") in each of these situations? If you are never or rarely in the situation, please make your best guess for what would happen.|[
[D_403155173] Sitting and reading;
[D_576621769] Watching television;
[D_988508028] Sitting inactive in public place (such as a theater or a meeting); [D_186488870] Riding as a passenger in a car for an hour without stopping;
[D_922388461] Lying down to rest in the afternoon;
[D_760686611] Sitting and talking to someone;
[D_354550061] Sitting quietly after a lunch that did not include alcohol;
[D_179705366] In a car, while you are stopped for a few minutes in traffic;
[D_955609858] At the dinner table;]|
(514068832:No chance)
(774439579:Slight Chance)
(747099514:Moderate Chance)
(977681388: High Chance)|
[GRID_FOLLOWUP] The saved grid answer can now be revisited.
[END,end] Done.
`;

export const productionSleepGridRows = Object.freeze({
  D_403155173: '774439579',
  D_576621769: '747099514',
  D_988508028: '977681388',
  D_186488870: '514068832',
  D_922388461: '774439579',
  D_760686611: '747099514',
  D_354550061: '977681388',
  D_179705366: '514068832',
  D_955609858: '774439579',
});

export async function selectProductionSleepGridRows(grid, expectedRows) {
  for (const [rowId, selectedValue] of Object.entries(expectedRows)) {
    const response = grid.locator(`input[name="${rowId}"][value="${selectedValue}"]`);
    await response.locator('xpath=following-sibling::label').click();
  }
}
