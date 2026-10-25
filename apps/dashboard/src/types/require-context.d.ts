// webpack's require.context, used by src/app/blog/posts.ts.
declare namespace NodeJS {
  interface Require {
    context(directory: string, useSubdirectories: boolean, regExp: RegExp): {
      keys(): string[];
      <T>(id: string): T;
    };
  }
}
