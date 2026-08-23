/*
<MODULE_CONTRACT>
<purpose>Defines a custom error class for handling pipeline pause exceptions in applications.</purpose>
<non-goals>
  <item>Does not implement logic for pausing the pipeline itself.</item>
  <item>Does not handle other types of errors or exceptions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.summary.trim; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

export class PipelinePauseError extends Error {
  override name = "PipelinePauseError";
}
