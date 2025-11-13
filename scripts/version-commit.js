#!/usr/bin/env node

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Get version from API package
function getVersion() {
  const apiPackageJson = JSON.parse(
    readFileSync(join(process.cwd(), "packages/api/package.json"), "utf-8"),
  );
  return apiPackageJson.version;
}

// Extract changelog for current version
function extractChangelog(version) {
  const changelogPath = join(process.cwd(), "packages/api/CHANGELOG.md");

  try {
    const changelog = readFileSync(changelogPath, "utf-8");

    // Match the version section in the changelog
    const versionRegex = new RegExp(
      `##\\s*\\[?${version.replace(/\./g, "\\.")}\\]?[\\s\\S]*?(?=\\n##\\s|$)`,
      "i",
    );

    const match = changelog.match(versionRegex);

    if (match) {
      // Remove the version header line and clean up
      let content = match[0].replace(/^##\s*\[?[\d.]+\]?.*\n+/, "").trim();

      if (content) {
        return content;
      }
    }

    // Try web package if API changelog doesn't have content
    return getChangelogFromWeb(version);
  } catch (error) {
    console.warn(
      "Warning: Could not read API CHANGELOG.md, trying web package...",
    );
    return getChangelogFromWeb(version);
  }
}

function getChangelogFromWeb(version) {
  const webChangelogPath = join(process.cwd(), "packages/web/CHANGELOG.md");

  try {
    const changelog = readFileSync(webChangelogPath, "utf-8");
    const versionRegex = new RegExp(
      `##\\s*\\[?${version.replace(/\./g, "\\.")}\\]?[\\s\\S]*?(?=\\n##\\s|$)`,
      "i",
    );

    const match = changelog.match(versionRegex);

    if (match) {
      let content = match[0].replace(/^##\s*\[?[\d.]+\]?.*\n+/, "").trim();

      if (content) {
        return content;
      }
    }
  } catch (error) {
    console.warn("Warning: Could not read web CHANGELOG.md");
  }

  return "Version bump";
}

// Create commit with version and changelog
function createCommit(version, changelog) {
  const tempFile = join(tmpdir(), `commit-message-${Date.now()}.txt`);
  const commitMessage = `chore: release v${version}\n\n${changelog}`;

  writeFileSync(tempFile, commitMessage);

  try {
    console.log(`Creating commit for version ${version}...`);
    execSync(`git commit -F "${tempFile}"`, { stdio: "inherit" });
    console.log("✓ Commit created successfully");
  } finally {
    // Clean up temp file
    try {
      execSync(`rm -f "${tempFile}"`);
    } catch {}
  }
}

// Main execution
function main() {
  console.log("Creating version commit with changelog...\n");

  const version = getVersion();
  console.log(`Version: ${version}`);

  const changelog = extractChangelog(version);
  console.log("\nChangelog extracted.\n");

  createCommit(version, changelog);
}

main();
