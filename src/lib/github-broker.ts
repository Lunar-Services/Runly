import "server-only";
import { createHash } from "node:crypto";
import { ApiError, adminClient } from "@/lib/api";
import { installationToken, type GithubRepository } from "@/lib/github";
import { validWorkspacePath } from "@/lib/runtime/shared";
import { internalFiles, type SourceFile } from "@/lib/runtime/internal-files";

type Ref = { object: { sha: string } };
type TreeEntry = {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
};
type Tree = { tree: TreeEntry[]; truncated: boolean };
type ProjectGit = {
  id: string;
  github_branch: string | null;
  github_commit_sha: string | null;
};

function blobSha(content: string) {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

async function githubApi<T>(
  token: string,
  path: string,
  method = "GET",
  payload?: unknown,
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new ApiError(
      response.status === 404
        ? 404
        : response.status === 409 || response.status === 422
          ? 409
          : 502,
      response.status === 409 || response.status === 422
        ? "GitHub rejected this change. Refresh the repository and check branch protection."
        : "GitHub is unavailable or repository access was revoked.",
    );
  return response.json() as Promise<T>;
}

function repositoryPath(repository: GithubRepository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.full_name))
    throw new ApiError(400, "Invalid GitHub repository.");
  return `/repos/${repository.full_name}`;
}

async function ref(token: string, repo: string, branch: string) {
  return githubApi<Ref>(
    token,
    `${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
}

async function treeForCommit(token: string, repo: string, commitSha: string) {
  const commit = await githubApi<{ tree: { sha: string } }>(
    token,
    `${repo}/git/commits/${commitSha}`,
  );
  const tree = await githubApi<Tree>(
    token,
    `${repo}/git/trees/${commit.tree.sha}?recursive=1`,
  );
  if (tree.truncated || tree.tree.length > 1000)
    throw new ApiError(
      409,
      "This repository exceeds the workspace's 1,000 file limit.",
    );
  let total = 0;
  for (const entry of tree.tree) {
    if (entry.type === "tree") continue;
    if (
      entry.type !== "blob" ||
      !["100644", "100755"].includes(entry.mode) ||
      !validWorkspacePath(entry.path)
    )
      throw new ApiError(409, `Unsupported repository file: ${entry.path}`);
    total += entry.size || 0;
    if ((entry.size || 0) > 1024 * 1024 || total > 8 * 1024 * 1024)
      throw new ApiError(
        409,
        "This repository exceeds the workspace source size limit.",
      );
  }
  return tree;
}

async function remoteFiles(token: string, repo: string, tree: Tree) {
  const entries = tree.tree.filter((entry) => entry.type === "blob");
  const files: SourceFile[] = [];
  let total = 0;
  for (let i = 0; i < entries.length; i += 8) {
    const batch = await Promise.all(
      entries.slice(i, i + 8).map(async (entry) => {
        const blob = await githubApi<{ content: string; encoding: string }>(
          token,
          `${repo}/git/blobs/${entry.sha}`,
        );
        if (blob.encoding !== "base64")
          throw new ApiError(409, `Unsupported file encoding: ${entry.path}`);
        const bytes = Buffer.from(blob.content.replaceAll(/\s/g, ""), "base64");
        total += bytes.length;
        let content: string;
        try {
          content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          throw new ApiError(
            409,
            `Binary file cannot be imported: ${entry.path}`,
          );
        }
        if (
          content.includes("\0") ||
          bytes.length > 1024 * 1024 ||
          total > 8 * 1024 * 1024 ||
          blobSha(content) !== entry.sha
        )
          throw new ApiError(409, `Unsupported or corrupt file: ${entry.path}`);
        return {
          path: entry.path,
          kind: "file" as const,
          content,
          hash: createHash("sha256").update(bytes).digest("hex"),
        };
      }),
    );
    files.push(...batch);
  }
  return files;
}

async function sourceFiles(project: string, user: string) {
  await internalFiles({ project, user, action: "snapshot" });
  const { data, error } = await adminClient()
    .from("runtime_files")
    .select("path,kind,content,hash")
    .eq("project_id", project)
    .order("path")
    .limit(1001);
  if (error || !data || data.length > 1000)
    throw new ApiError(503, "Couldn't load the complete workspace snapshot.");
  if (
    data.some(
      (file) =>
        !validWorkspacePath(file.path) ||
        (file.kind === "file" &&
          createHash("sha256").update(file.content).digest("hex") !==
            file.hash),
    )
  )
    throw new ApiError(
      503,
      "Workspace snapshot is inconsistent. Retry after refreshing.",
    );
  return data as SourceFile[];
}

function isDirty(source: SourceFile[], tree: Tree) {
  const remote = new Map(
    tree.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => [entry.path, entry.sha]),
  );
  const local = source.filter((file) => file.kind === "file");
  return (
    local.length !== remote.size ||
    local.some((file) => remote.get(file.path) !== blobSha(file.content))
  );
}

async function branches(token: string, repo: string) {
  const result: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await githubApi<{ name: string }[]>(
      token,
      `${repo}/branches?per_page=100&page=${page}`,
    );
    result.push(...batch.map((item) => item.name));
    if (batch.length < 100) break;
  }
  return result;
}

async function pushFiles(
  token: string,
  repo: string,
  branch: string,
  parent: string,
  source: SourceFile[],
  previous: Tree,
  message: string,
  author?: string,
  email?: string,
) {
  const modes = new Map(
    previous.tree
      .filter((entry) => entry.type === "blob")
      .map((entry) => [entry.path, entry.mode]),
  );
  const tree = await githubApi<{ sha: string }>(
    token,
    `${repo}/git/trees`,
    "POST",
    {
      tree: source
        .filter((file) => file.kind === "file")
        .map((file) => ({
          path: file.path,
          mode: modes.get(file.path) === "100755" ? "100755" : "100644",
          type: "blob",
          content: file.content,
        })),
    },
  );
  const next = await githubApi<{ sha: string }>(
    token,
    `${repo}/git/commits`,
    "POST",
    {
      message,
      tree: tree.sha,
      parents: [parent],
      author: { name: author, email },
    },
  );
  await githubApi(
    token,
    `${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    "PATCH",
    {
      sha: next.sha,
      force: false,
    },
  );
  return next.sha;
}

export async function brokerGit(input: {
  project: ProjectGit;
  user: string;
  repository: GithubRepository;
  installationId: number;
  action: "link" | "status" | "branch" | "checkout" | "pull" | "push";
  branch: string;
  message?: string;
  author?: string;
  email?: string;
}) {
  const { project, user, repository, action, branch } = input;
  const repo = repositoryPath(repository);
  const token = await installationToken(input.installationId, repository.id);
  const source = await sourceFiles(project.id, user);
  const currentBranch = project.github_branch || branch;
  const baselineSha = project.github_commit_sha;
  let initializedHere = false;
  let currentRef: Ref;
  try {
    currentRef = await ref(token, repo, currentBranch);
  } catch (error) {
    if (
      action !== "link" ||
      !(error instanceof ApiError) ||
      ![404, 409].includes(error.status)
    )
      throw error;
    initializedHere = true;
    const first = source.find((file) => file.kind === "file") || {
      path: "README.md",
      content: `# ${repository.full_name.split("/")[1]}\n`,
      kind: "file" as const,
      hash: "",
    };
    await githubApi(
      token,
      `${repo}/contents/${first.path.split("/").map(encodeURIComponent).join("/")}`,
      "PUT",
      {
        message: "Initialize Runly project",
        content: Buffer.from(first.content, "utf8").toString("base64"),
      },
    );
    currentRef = await ref(token, repo, currentBranch);
    if (source.filter((file) => file.kind === "file").length > 1) {
      const initial = await treeForCommit(token, repo, currentRef.object.sha);
      const sha = await pushFiles(
        token,
        repo,
        currentBranch,
        currentRef.object.sha,
        source,
        initial,
        "Import Runly project",
        input.author,
        input.email,
      );
      currentRef = { object: { sha } };
    }
  }
  let currentTree = await treeForCommit(token, repo, currentRef.object.sha);
  const baselineTree = baselineSha
    ? await treeForCommit(token, repo, baselineSha)
    : currentTree;
  const dirty = isDirty(source, baselineTree);
  let commit = baselineSha || currentRef.object.sha;
  let selectedBranch = currentBranch;

  if (action === "link") {
    if (
      !initializedHere &&
      source.some((file) => file.kind === "file") &&
      currentTree.tree.some((entry) => entry.type === "blob")
    )
      throw new ApiError(
        409,
        "Import a non-empty repository into a new blank project.",
      );
    if (!source.some((file) => file.kind === "file")) {
      const files = await remoteFiles(token, repo, currentTree);
      await internalFiles({
        project: project.id,
        user,
        action: "replace",
        expected: source,
        files,
      });
    }
    commit = currentRef.object.sha;
  } else if (action === "branch") {
    if (dirty)
      throw new ApiError(
        409,
        "Push or discard local changes before creating a branch.",
      );
    if (currentRef.object.sha !== baselineSha)
      throw new ApiError(
        409,
        "The remote branch changed. Pull it before creating a branch.",
      );
    await githubApi(token, `${repo}/git/refs`, "POST", {
      ref: `refs/heads/${branch}`,
      sha: currentRef.object.sha,
    });
    selectedBranch = branch;
    commit = currentRef.object.sha;
  } else if (action === "checkout" || action === "pull") {
    if (dirty)
      throw new ApiError(
        409,
        "Push or discard local changes before switching or pulling.",
      );
    selectedBranch = action === "checkout" ? branch : currentBranch;
    currentRef = await ref(token, repo, selectedBranch);
    currentTree = await treeForCommit(token, repo, currentRef.object.sha);
    const files = await remoteFiles(token, repo, currentTree);
    await internalFiles({
      project: project.id,
      user,
      action: "replace",
      expected: source,
      files,
    });
    commit = currentRef.object.sha;
  } else if (action === "push") {
    if (currentRef.object.sha !== baselineSha)
      throw new ApiError(
        409,
        "The remote branch changed. Pull it before pushing.",
      );
    if (dirty) {
      commit = await pushFiles(
        token,
        repo,
        currentBranch,
        currentRef.object.sha,
        source,
        currentTree,
        input.message!,
        input.author,
        input.email,
      );
    }
  }

  return {
    initialized: true,
    branch: selectedBranch,
    branches: await branches(token, repo),
    dirty: action === "status" ? dirty : false,
    commit,
  };
}
