import { postApprovedQueue } from "../src/post.mjs";
import { outRoots } from "../src/paths.mjs";

const roots = outRoots();
const { results } = await postApprovedQueue({
  approvedRoot: roots.approved,
  postedRoot: roots.posted,
});
const ok = results.filter((r) => r.ok).length;
console.log(`post done: ${ok}/${results.length} moved to out/posted/`);
