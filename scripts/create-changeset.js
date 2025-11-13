#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import { writeFileSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Get the last git tag
function getLastTag() {
  try {
    return execSync("git describe --tags --abbrev=0", {
      encoding: "utf-8",
    }).trim();
  } catch (error) {
    // If no tags exist, use the first commit
    try {
      return execSync("git rev-list --max-parents=0 HEAD", {
        encoding: "utf-8",
      }).trim();
    } catch {
      console.error("Error: Could not find any commits in the repository");
      process.exit(1);
    }
  }
}

// Get all commit messages since the last tag
function getCommitsSinceTag(tag) {
  try {
    const commits = execSync(`git log ${tag}..HEAD --pretty=format:"- %s"`, {
      encoding: "utf-8",
    }).trim();
    return commits || "- No commits since last tag";
  } catch (error) {
    console.error("Error getting commits:", error.message);
    return "- Error retrieving commits";
  }
}

// Run changeset CLI with a script to auto-fill summary
function runChangesetWithAutoSummary(commits) {
  return new Promise((resolve, reject) => {
    // Create a temporary file with the commits
    const tempSummaryFile = join(
      tmpdir(),
      `changeset-summary-${Date.now()}.txt`,
    );
    writeFileSync(tempSummaryFile, commits);

    console.log("Running changeset CLI...");
    console.log("Instructions:");
    console.log("  1. Select packages (use space to select, enter to confirm)");
    console.log("  2. Choose bump type (patch/minor/major)");
    console.log("  3. When asked for summary, press ENTER to open editor");
    console.log("     The editor will have commit messages prefilled\n");

    // Set EDITOR to a script that prefills the file
    const originalEditor = process.env.EDITOR || process.env.VISUAL || "vi";
    const wrapperScript = join(tmpdir(), `editor-wrapper-${Date.now()}.sh`);

    // Create wrapper script that prefills the file before opening editor
    const wrapperContent = `#!/bin/bash
FILE="$1"

# Read the file content
CONTENT=$(cat "$FILE")

# Check if it's the changeset summary prompt (contains "Please enter a summary")
if echo "$CONTENT" | grep -q "Please enter a summary"; then
  # Extract just the comment lines
  COMMENTS=$(echo "$CONTENT" | grep "^#")

  # Create new content with commits + comments
  {
    cat "${tempSummaryFile}"
    echo ""
    echo "$COMMENTS"
  } > "$FILE"
fi

# Open the real editor
exec ${originalEditor} "$FILE"
`;
    writeFileSync(wrapperScript, wrapperContent);
    execSync(`chmod +x "${wrapperScript}"`);

    const child = spawn("pnpm", ["exec", "changeset"], {
      stdio: "inherit",
      env: {
        ...process.env,
        EDITOR: wrapperScript,
        VISUAL: wrapperScript,
      },
    });

    child.on("exit", (code) => {
      // Clean up
      try {
        execSync(`rm -f "${tempSummaryFile}" "${wrapperScript}"`);
      } catch {}

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Changeset exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      // Clean up
      try {
        execSync(`rm -f "${tempSummaryFile}" "${wrapperScript}"`);
      } catch {}
      reject(err);
    });
  });
}

// Main execution
async function main() {
  console.log("Creating changeset with commit messages since last tag...\n");

  const lastTag = getLastTag();
  console.log(`Last tag: ${lastTag}\n`);

  const commits = getCommitsSinceTag(lastTag);
  console.log("Commits since last tag:");
  console.log(commits);
  console.log("\n" + "─".repeat(80) + "\n");

  try {
    await runChangesetWithAutoSummary(commits);
    console.log("\n✓ Changeset created successfully!");
    console.log('Run "pnpm changeset:status" to see pending changesets.');
  } catch (error) {
    if (error.message.includes("code 1")) {
      console.log("\nChangeset creation was cancelled.");
    } else {
      console.error("Error:", error.message);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
