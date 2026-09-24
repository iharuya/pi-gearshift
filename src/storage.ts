import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { UserFacingError } from "./errors.js";

const expandHome = (path: string): string => {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
};

export const dataDirectory = (): string => {
  const configured = process.env.PI_GEARSHIFT_DATA_DIR?.trim();
  if (!configured) return join(getAgentDir(), "pi-gearshift");

  const expanded = expandHome(configured);
  return isAbsolute(expanded) ? expanded : resolve(expanded);
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const assertRegularFile = (path: string): void => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Refusing to read ${path}: it is not a regular file.`);
  }
};

const assertPrivateFile = (path: string): void => {
  if (process.platform === "win32") return;
  if ((lstatSync(path).mode & 0o077) !== 0) {
    throw new Error(
      `Refusing to read ${path}: it is accessible by other users. Run chmod 600 on it or log in again.`,
    );
  }
};

export const readJson = (
  path: string,
  privateFile = false,
): unknown | undefined => {
  try {
    assertRegularFile(path);
    if (privateFile) assertPrivateFile(path);
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    if (isMissing(error)) return undefined;
    if (
      error instanceof Error &&
      error.message.startsWith("Refusing to read")
    ) {
      throw error;
    }
    throw new Error(`Could not read ${path}.`);
  }
};

const prepareDirectory = (path: string): void => {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(path, 0o700);
};

export const writePrivateJson = (path: string, value: unknown): void => {
  const directory = dirname(path);
  const temporary = join(directory, `.${randomUUID()}.tmp`);

  try {
    prepareDirectory(directory);
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    if (process.platform !== "win32") chmodSync(temporary, 0o600);
    renameSync(temporary, path);
  } catch {
    try {
      rmSync(temporary, { force: true });
    } catch {}
    throw new UserFacingError(
      `Could not write ${path}. Check directory permissions and free disk space.`,
    );
  }
};

export const removeFile = (path: string): boolean => {
  try {
    assertRegularFile(path);
    rmSync(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    if (
      error instanceof Error &&
      error.message.startsWith("Refusing to read")
    ) {
      throw error;
    }
    throw new Error(`Could not remove ${path}.`);
  }
};
