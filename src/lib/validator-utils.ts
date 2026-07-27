/*
<MODULE_CONTRACT>
<purpose>Composes multiple asynchronous validators into a single validator function.</purpose>
<non-goals>
  <item>Does not handle synchronous validation logic.</item>
  <item>Does not provide error handling for individual validators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of composeValidators function.</item>
</CHANGE_SUMMARY>
*/

export type AsyncValidator<TOptions> = (options: TOptions) => Promise<void>;

export const composeValidators = <TOptions>(
  ...validators: AsyncValidator<TOptions>[]
): AsyncValidator<TOptions> => {
  return async (options: TOptions) => {
    for (const validator of validators) {
      await validator(options);
    }
  };
};
