/*
<MODULE_CONTRACT>
<purpose>Define a default user prompt to guide system interactions and ensure responses are formatted correctly.</purpose>
<non-goals>
  <item>Does not handle dynamic user input or prompt customization.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial definition of the default empty user prompt constant.</item>
</CHANGE_SUMMARY>
*/

export const DEFAULT_EMPTY_USER_PROMPT =
  "Follow the system instructions exactly and return only the requested result in the required format.";
