#!/usr/bin/env node

import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
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
    // Format: ## 1.1.7 or ## [1.1.7] or ### 1.1.7
    const versionRegex = new RegExp(
      `##\\s*\\[?${version.replace(/\./g, "\\.")}\\]?[\\s\\S]*?(?=\\n##\\s|$)`,
      "i",
    );

    const match = changelog.match(versionRegex);

    if (match) {
      // Remove the version header line and clean up
      let content = match[0].replace(/^##\s*\[?[\d.]+\]?.*\n+/, "").trim();

      // If content is empty, check web package changelog
      if (!content) {
        return getChangelogFromWeb(version);
      }

      return content;
    }

    // Try web package if API changelog doesn't have the version
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

  return "No changelog entries found for this version.";
}

// Create an annotated tag with changelog
function createTag(version, changelog) {
  const tagName = `v${version}`;

  // Create a temporary file for the tag message
  const tempFile = join(tmpdir(), `tag-message-${Date.now()}.txt`);
  const tagMessage = `Release ${tagName}\n\n${changelog}`;

  writeFileSync(tempFile, tagMessage);

  try {
    // Check if tag already exists
    try {
      execSync(`git rev-parse ${tagName}`, { stdio: "ignore" });
      console.log(`Tag ${tagName} already exists. Deleting and recreating...`);
      execSync(`git tag -d ${tagName}`);
    } catch {
      // Tag doesn't exist, which is fine
    }

    // Create the annotated tag
    execSync(`git tag -a ${tagName} -F "${tempFile}"`, { stdio: "inherit" });
    console.log(`\nCreated annotated tag: ${tagName}`);
    console.log("\nTag message:");
    console.log("─".repeat(80));
    console.log(tagMessage);
    console.log("─".repeat(80));
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Main execution
function main() {
  console.log("Creating git tag with changelog...\n");

  const version = getVersion();
  console.log(`Version: ${version}`);

  const changelog = extractChangelog(version);
  console.log("\nChangelog extracted successfully.\n");

  createTag(version, changelog);

  console.log("\nTag created successfully!");
  console.log('Run "git push --tags" to push the tag to remote.');
}

main();
