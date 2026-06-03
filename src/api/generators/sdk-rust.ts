import type { Oas } from "@mihari/oas";

import {
  iterSchemas,
  kebabCase,
  listOperations,
  pascalCase,
  schemaIsArrayOfRef,
  schemaIsRef,
  schemaToRust,
  snakeCase,
  specTitle,
  type GenerateResult,
  type NormalisedOperation,
} from "./shared.ts";

export interface GenerateSdkRustOptions {
  /** Crate name (Cargo). Default: `<kebab-title>-sdk`. */
  crateName?: string;
  /** Emit an async client built on `reqwest::Client` instead of the blocking one. */
  async?: boolean;
}

/**
 * Generates a Rust SDK on top of `reqwest`. Returns typed structs for every
 * `components.schemas.*` entry (via serde) and falls back to `serde_json::Value`
 * for un-named shapes. Pass `async: true` to produce async methods.
 */
export function generateSdkRust(
  oas: Oas,
  options: GenerateSdkRustOptions = {},
): GenerateResult {
  const title = specTitle(oas);
  const crateName = options.crateName ?? `${kebabCase(title)}-sdk`;
  const structName = `${sanitizeRustIdentifier(pascalCase(title))}Client`;
  const operations = listOperations(oas);
  const schemas = iterSchemas(oas);
  const isAsync = options.async === true;

  return {
    files: [
      { path: "Cargo.toml", content: renderCargoToml(crateName, isAsync) },
      { path: ".gitignore", content: "/target\n/Cargo.lock\n" },
      { path: "README.md", content: renderReadme(title, crateName, structName, isAsync) },
      { path: "src/types.rs", content: renderTypes(schemas) },
      { path: "src/lib.rs", content: renderLib(structName, operations, isAsync) },
    ],
  };
}

function renderTypes(schemas: Array<{ name: string; schema: unknown }>): string {
  if (!schemas.length) {
    return "// No components.schemas declared in the OpenAPI document.\n";
  }
  return schemas.map(({ name, schema }) => renderStruct(name, schema)).join("\n\n") + "\n";
}

function renderStruct(name: string, schema: unknown): string {
  if (!schema || typeof schema !== "object") {
    return `pub type ${name} = serde_json::Value;`;
  }
  const s = schema as Record<string, unknown>;
  if (s.type !== "object" || !s.properties) {
    // Not an object: emit a type alias instead.
    return `pub type ${name} = ${schemaToRust(schema)};`;
  }
  const properties = s.properties as Record<string, unknown>;
  const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
  const lines: string[] = [];
  for (const [key, prop] of Object.entries(properties)) {
    const rustName = snakeCase(key).replace(/[^a-zA-Z0-9_]/g, "_");
    const rename = rustName === key ? "" : `    #[serde(rename = ${JSON.stringify(key)})]\n`;
    const baseType = schemaToRust(prop);
    const optionalSkip = required.has(key)
      ? ""
      : `    #[serde(skip_serializing_if = "Option::is_none")]\n`;
    const fieldType = required.has(key) ? baseType : `Option<${baseType}>`;
    lines.push(`${optionalSkip}${rename}    pub ${rustName}: ${fieldType},`);
  }
  return `#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ${name} {
${lines.join("\n")}
}`;
}

const RUST_KEYWORDS = new Set([
  "as", "break", "const", "continue", "crate", "else", "enum", "extern",
  "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod",
  "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct",
  "super", "trait", "true", "type", "unsafe", "use", "where", "while",
  "async", "await", "dyn", "abstract", "become", "box", "do", "final",
  "macro", "override", "priv", "typeof", "unsized", "virtual", "yield",
]);

function sanitizeRustIdentifier(raw: string): string {
  let id = raw.replace(/[^a-zA-Z0-9_]/g, "_");
  if (/^[0-9]/.test(id)) id = `_${id}`;
  if (RUST_KEYWORDS.has(id)) id = `r#${id}`;
  return id;
}

function rustSnakeIdent(raw: string): string {
  const snake = snakeCase(raw).replace(/[^a-zA-Z0-9_]/g, "_");
  return RUST_KEYWORDS.has(snake) ? `r#${snake}` : snake;
}

function renderCargoToml(crateName: string, isAsync: boolean): string {
  const reqwestFeatures = isAsync ? `["json"]` : `["blocking", "json"]`;
  return `[package]
name = "${crateName}"
version = "0.1.0"
edition = "2021"

[dependencies]
reqwest = { version = "0.12", features = ${reqwestFeatures} }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
urlencoding = "2"
`;
}

function renderReadme(
  title: string,
  crateName: string,
  structName: string,
  isAsync: boolean,
): string {
  const flavour = isAsync ? "async" : "blocking";
  const mainExample = isAsync
    ? `#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = ${structName}::new("https://api.example.com", Some("token".into()));
    let pets = client.list_pets().await?;
    println!("{pets:?}");
    Ok(())
}`
    : `fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = ${structName}::new("https://api.example.com", Some("token".into()));
    let pets = client.list_pets()?;
    println!("{pets:?}");
    Ok(())
}`;
  const tokioNote = isAsync
    ? `\n> You need an async runtime (e.g. \`tokio\`) to execute these futures.`
    : "";
  const fromSpecCall = isAsync
    ? `${structName}::from_spec("https://api.example.com/openapi.json", None).await?`
    : `${structName}::from_spec("https://api.example.com/openapi.json", None)?`;

  return `# ${title} SDK (Rust)

Generated by \`mihari api generate sdk --lang rust${isAsync ? " --async" : ""}\`. ${flavour} client built on [\`reqwest\`](https://docs.rs/reqwest) with typed serde models for every \`components.schemas.*\`.${tokioNote}

## Usage

\`\`\`toml
# Cargo.toml
[dependencies]
${crateName} = { path = "./sdk-rust" }
${isAsync ? 'tokio = { version = "1", features = ["full"] }\n' : ""}\`\`\`

\`\`\`rust
use ${crateName.replace(/-/g, "_")}::${structName};

${mainExample}
\`\`\`

Or resolve the base URL from the spec:

\`\`\`rust
let client = ${fromSpecCall};
\`\`\`
`;
}

function renderLib(
  structName: string,
  operations: NormalisedOperation[],
  isAsync: boolean,
): string {
  const methods = operations.map((op) => renderMethod(op, isAsync)).join("\n\n");
  const clientImport = isAsync
    ? "use reqwest::Client as HttpClient;"
    : "use reqwest::blocking::Client as HttpClient;";
  return `//! Auto-generated HTTP client. Do not edit by hand.

pub mod types;
pub use types::*;

${clientImport}
use serde::de::DeserializeOwned;
use serde_json::Value;

#[derive(Debug)]
pub enum Error {
    Http(reqwest::Error),
    Status { status: u16, body: String },
    Json(serde_json::Error),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Http(e) => write!(f, "http: {e}"),
            Error::Status { status, body } => write!(f, "status {status}: {body}"),
            Error::Json(e) => write!(f, "json: {e}"),
        }
    }
}

impl std::error::Error for Error {}

impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self { Error::Http(e) }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self { Error::Json(e) }
}

pub type Result<T> = std::result::Result<T, Error>;

pub struct ${structName} {
    base_url: String,
    token: Option<String>,
    http: HttpClient,
}

impl ${structName} {
    pub fn new(base_url: impl Into<String>, token: Option<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            token,
            http: HttpClient::new(),
        }
    }

${renderFromSpec(isAsync)}

${renderSendImpl(isAsync)}

${methods}
}
`;
}

function renderFromSpec(isAsync: boolean): string {
  if (isAsync) {
    return `    /// Build a client by reading \`servers[0].url\` from the JSON spec at \`spec_url\`.
    pub async fn from_spec(spec_url: &str, token: Option<String>) -> Result<Self> {
        let body: Value = reqwest::get(spec_url).await?.error_for_status()?.json().await?;
        let url = body
            .get("servers")
            .and_then(Value::as_array)
            .and_then(|a| a.first())
            .and_then(|s| s.get("url"))
            .and_then(Value::as_str)
            .ok_or_else(|| Error::Status { status: 0, body: "no servers[] in spec".into() })?
            .to_string();
        Ok(Self::new(url, token))
    }`;
  }
  return `    /// Build a client by reading \`servers[0].url\` from the JSON spec at \`spec_url\`.
    pub fn from_spec(spec_url: &str, token: Option<String>) -> Result<Self> {
        let body: Value = reqwest::blocking::get(spec_url)?.error_for_status()?.json()?;
        let url = body
            .get("servers")
            .and_then(Value::as_array)
            .and_then(|a| a.first())
            .and_then(|s| s.get("url"))
            .and_then(Value::as_str)
            .ok_or_else(|| Error::Status { status: 0, body: "no servers[] in spec".into() })?
            .to_string();
        Ok(Self::new(url, token))
    }`;
}

function renderSendImpl(isAsync: boolean): string {
  if (isAsync) {
    return `    async fn send<T: DeserializeOwned>(&self, builder: reqwest::RequestBuilder) -> Result<T> {
        let mut req = builder.header("Accept", "application/json");
        if let Some(t) = &self.token {
            req = req.bearer_auth(t);
        }
        let response = req.send().await?;
        let status = response.status();
        if !status.is_success() {
            return Err(Error::Status {
                status: status.as_u16(),
                body: response.text().await.unwrap_or_default(),
            });
        }
        let text = response.text().await?;
        if text.is_empty() {
            return Ok(serde_json::from_str(&Value::Null.to_string())?);
        }
        Ok(serde_json::from_str(&text)?)
    }`;
  }
  return `    fn send<T: DeserializeOwned>(&self, builder: reqwest::blocking::RequestBuilder) -> Result<T> {
        let mut req = builder.header("Accept", "application/json");
        if let Some(t) = &self.token {
            req = req.bearer_auth(t);
        }
        let response = req.send()?;
        let status = response.status();
        if !status.is_success() {
            return Err(Error::Status {
                status: status.as_u16(),
                body: response.text().unwrap_or_default(),
            });
        }
        let text = response.text()?;
        if text.is_empty() {
            return Ok(serde_json::from_str(&Value::Null.to_string())?);
        }
        Ok(serde_json::from_str(&text)?)
    }`;
}

function renderMethod(op: NormalisedOperation, isAsync: boolean): string {
  const name = rustSnakeIdent(op.operationId);
  const pathArgs: string[] = [];
  const pathReplacements: string[] = [];

  for (const p of op.pathParams) {
    const ident = rustSnakeIdent(p.name);
    const rustType = rustParamType(p.schema, false);
    pathArgs.push(`${ident}: ${rustType}`);
    pathReplacements.push(
      `        let path = path.replace("{${p.name}}", &urlencoding::encode(&${rustToStringExpr(ident, rustType)}));`,
    );
  }

  const queryLines: string[] = [];
  const queryArgs: string[] = [];
  for (const p of op.queryParams) {
    const ident = rustSnakeIdent(p.name);
    const rustType = rustParamType(p.schema, !p.required);
    queryArgs.push(`${ident}: ${rustType}`);
    if (p.required) {
      queryLines.push(
        `        query.push((${JSON.stringify(p.name)}.to_string(), ${rustToStringExpr(ident, rustType)}));`,
      );
    } else {
      queryLines.push(
        `        if let Some(v) = ${ident} {\n            query.push((${JSON.stringify(p.name)}.to_string(), ${rustToStringExpr("v", rustType.replace(/^Option<(.+)>$/, "$1"))}));\n        }`,
      );
    }
  }

  const bodyType = rustBodyType(op);
  const args = ["&self", ...pathArgs, ...queryArgs];
  if (op.requestBodySchema) args.push(`body: &${bodyType}`);

  const returnType = rustReturnType(op);

  const pathInit =
    pathReplacements.length === 0
      ? `        let path = ${JSON.stringify(op.path)}.to_string();`
      : `        let path = ${JSON.stringify(op.path)}.to_string();\n${pathReplacements.join("\n")}`;

  const queryInit = op.queryParams.length
    ? `        let mut query: Vec<(String, String)> = Vec::new();\n${queryLines.join("\n")}`
    : `        let query: Vec<(String, String)> = Vec::new();`;

  const method = op.method.toLowerCase();
  const builderLine = op.requestBodySchema
    ? `        let req = self.http.${method}(url).query(&query).json(body);`
    : `        let req = self.http.${method}(url).query(&query);`;

  const doc = op.summary
    ? `    /// ${op.summary}\n    /// ${op.method.toUpperCase()} ${op.path}`
    : `    /// ${op.method.toUpperCase()} ${op.path}`;

  const keyword = isAsync ? "pub async fn" : "pub fn";
  const call = isAsync ? "self.send(req).await" : "self.send(req)";

  return `${doc}
    ${keyword} ${name}(${args.join(", ")}) -> Result<${returnType}> {
${pathInit}
${queryInit}
        let url = format!("{}{}", self.base_url, path);
${builderLine}
        ${call}
    }`;
}

function rustReturnType(op: NormalisedOperation): string {
  const schema = op.successResponse?.schema;
  if (!schema) return "Value";
  const refName = schemaIsRef(schema);
  if (refName) return refName;
  const arrayRef = schemaIsArrayOfRef(schema);
  if (arrayRef) return `Vec<${arrayRef}>`;
  return "Value";
}

function rustBodyType(op: NormalisedOperation): string {
  const schema = op.requestBodySchema;
  if (!schema) return "Value";
  const refName = schemaIsRef(schema);
  if (refName) return refName;
  const arrayRef = schemaIsArrayOfRef(schema);
  if (arrayRef) return `Vec<${arrayRef}>`;
  return "Value";
}

function rustParamType(schema: unknown, optional: boolean): string {
  const base = rustBaseType(schema);
  return optional ? `Option<${base}>` : base;
}

function rustBaseType(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "&Value";
  const s = schema as Record<string, unknown>;
  if (Array.isArray(s.enum)) return "&str";
  switch (s.type) {
    case "string":
      return "&str";
    case "integer":
      return "i64";
    case "number":
      return "f64";
    case "boolean":
      return "bool";
    default:
      return "&Value";
  }
}

function rustToStringExpr(ident: string, rustType: string): string {
  switch (rustType) {
    case "&str":
      return `${ident}.to_string()`;
    case "i64":
    case "f64":
    case "bool":
      return `${ident}.to_string()`;
    case "String":
      return ident;
    default:
      return `serde_json::to_string(${ident}).unwrap_or_default()`;
  }
}
