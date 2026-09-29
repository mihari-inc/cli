import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { Oas } from "@mihari/oas";

import { generateJest } from "../../src/api/generators/jest.ts";
import { generatePlaywright } from "../../src/api/generators/playwright.ts";
import { generateSdk } from "../../src/api/generators/sdk.ts";
import { generateSdkGo } from "../../src/api/generators/sdk-go.ts";
import { generateSdkJava } from "../../src/api/generators/sdk-java.ts";
import { generateSdkPhp } from "../../src/api/generators/sdk-php.ts";
import { generateSdkPython } from "../../src/api/generators/sdk-python.ts";
import { generateSdkRust } from "../../src/api/generators/sdk-rust.ts";
import { generateServer } from "../../src/api/generators/server.ts";
import type { GenerateResult } from "../../src/api/generators/shared.ts";

const fixture = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "openapi",
  "tests",
  "fixtures",
  "oas",
  "petstore.yaml",
);

const typedFixture = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "openapi",
  "tests",
  "fixtures",
  "oas",
  "petstore-typed.yaml",
);

function fileByPath(result: GenerateResult, path: string): string {
  const file = result.files.find((f) => f.path === path);
  if (!file) throw new Error(`expected file ${path} in ${result.files.map((f) => f.path).join(", ")}`);
  return file.content;
}

describe("generateServer", () => {
  it("produces one handler per operation plus a Hono index", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateServer(oas);
    const paths = result.files.map((f) => f.path).sort();
    expect(paths).toContain("package.json");
    expect(paths).toContain("src/index.ts");
    expect(paths).toContain("src/handlers/listPets.ts");
    expect(paths).toContain("src/handlers/getPet.ts");
    expect(paths).toContain("src/handlers/createPet.ts");

    const index = fileByPath(result, "src/index.ts");
    // Route wiring uses Hono `:param` syntax
    expect(index).toContain('app.get("/pets/:id", getPet);');
    expect(index).toContain('app.get("/pets", listPets);');
    expect(index).toContain('app.post("/pets", createPet);');

    const handler = fileByPath(result, "src/handlers/getPet.ts");
    expect(handler).toContain('import type { Context } from "hono"');
    expect(handler).toContain('"not_implemented"');
    expect(handler).toContain('"GET"');
  });

  it("emits per-operation zod schemas and a parseRequest helper", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateServer(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("src/lib/validate.ts");
    expect(paths).toContain("src/schemas/listPets.ts");
    expect(paths).toContain("src/schemas/getPet.ts");
    expect(paths).toContain("src/schemas/createPet.ts");

    const helper = fileByPath(result, "src/lib/validate.ts");
    expect(helper).toContain("parseRequest");
    expect(helper).toContain('import type { ZodSchema, ZodError } from "zod"');

    const schemaListPets = fileByPath(result, "src/schemas/listPets.ts");
    // query.limit is an integer — must use z.coerce for query strings.
    expect(schemaListPets).toContain("z.coerce.number().int()");
    expect(schemaListPets).toContain("export const listPetsRequest");

    const schemaGetPet = fileByPath(result, "src/schemas/getPet.ts");
    expect(schemaGetPet).toContain("path: z.object({");
    expect(schemaGetPet).toMatch(/id:\s*z\.string\(\)/);

    const schemaCreatePet = fileByPath(result, "src/schemas/createPet.ts");
    expect(schemaCreatePet).toContain("body: z.object({");
    expect(schemaCreatePet).toContain("name: z.string()");

    const handler = fileByPath(result, "src/handlers/listPets.ts");
    expect(handler).toContain("parseRequest(c, listPetsRequest)");
    expect(handler).toContain("if (!parsed.ok) return parsed.response");
  });

  it("emits response schemas and uses `respond` to route outgoing bodies", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateServer(oas);
    const schema = fileByPath(result, "src/schemas/listPets.ts");
    expect(schema).toContain("export const listPetsResponses");
    expect(schema).toContain('"200":');

    const helper = fileByPath(result, "src/lib/validate.ts");
    expect(helper).toContain("export function respond");
    expect(helper).toContain("RESPONSE_VALIDATION");

    const handler = fileByPath(result, "src/handlers/listPets.ts");
    expect(handler).toContain("respond(c, listPetsResponses, 501,");
    expect(handler).not.toContain("return c.json(");
  });
});

describe("generateSdk", () => {
  it("emits a typed client class with one method per operation", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdk(oas);
    const client = fileByPath(result, "src/client.ts");
    expect(client).toContain("export class PetstoreClient");
    expect(client).toContain("async listPets(");
    expect(client).toContain("async getPet(input:");
    expect(client).toContain('`/pets/${encodeURIComponent(input.path.id)}`');
    expect(client).toContain('"POST"');
    expect(client).toContain('"GET"');

    // No components.schemas on the fixture → types.ts is explicit about that.
    const types = fileByPath(result, "src/types.ts");
    expect(types).toContain("No components.schemas");
  });

  it("respects a custom className option", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdk(oas, { className: "MyCustomClient" });
    expect(fileByPath(result, "src/client.ts")).toContain("export class MyCustomClient");
  });
});

describe("generateSdkPython", () => {
  it("emits snake_case methods and a requests-based client", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdkPython(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("pyproject.toml");
    expect(paths).toContain("petstore_sdk/__init__.py");
    expect(paths).toContain("petstore_sdk/client.py");

    const client = fileByPath(result, "petstore_sdk/client.py");
    expect(client).toContain("import requests");
    expect(client).toContain("class PetstoreClient:");
    expect(client).toContain("def list_pets(");
    expect(client).toContain("def get_pet(");
    expect(client).toContain("def create_pet(");
    expect(client).toContain("limit: Optional[int] = None");
    expect(client).toContain("def from_spec(");

    const pyproject = fileByPath(result, "pyproject.toml");
    expect(pyproject).toContain('requests>=2.31');
  });
});

describe("generateSdkGo", () => {
  it("emits a stdlib-only client with PascalCase exports", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdkGo(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("go.mod");
    expect(paths).toContain("client.go");

    const client = fileByPath(result, "client.go");
    expect(client).toContain("package petstore");
    expect(client).toContain("func NewClient(baseURL, token string)");
    expect(client).toContain("func FromSpec(");
    expect(client).toContain("func (c *Client) ListPets");
    expect(client).toContain("func (c *Client) GetPet");
    expect(client).toContain("func (c *Client) CreatePet");
    expect(client).toContain('"net/http"');
    // No third-party deps in go.mod
    const gomod = fileByPath(result, "go.mod");
    expect(gomod).toContain("module example.com/petstore-sdk");
    expect(gomod).not.toContain("require ");
  });

  it("respects a custom modulePath", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdkGo(oas, { modulePath: "github.com/acme/pet" });
    expect(fileByPath(result, "go.mod")).toContain("module github.com/acme/pet");
  });
});

describe("generateJest", () => {
  it("produces one test file per operation with stubbed path params", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateJest(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("tests/listPets.test.ts");
    expect(paths).toContain("tests/getPet.test.ts");
    expect(paths).toContain("tests/createPet.test.ts");
    expect(paths).toContain("jest.config.ts");

    const getPet = fileByPath(result, "tests/getPet.test.ts");
    expect(getPet).toContain('"GET"');
    expect(getPet).toContain("/pets/stub-id");
    expect(getPet).toContain("API_BASE_URL");

    const createPet = fileByPath(result, "tests/createPet.test.ts");
    expect(createPet).toContain("JSON.stringify({})");
    expect(createPet).toContain('"Content-Type"');
  });

  it("emits per-operation response schemas + validator helper", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateJest(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("tests/helpers/validator.ts");
    expect(paths).toContain("schemas/listPets.response.json");
    expect(paths).toContain("schemas/getPet.response.json");

    const validator = fileByPath(result, "tests/helpers/validator.ts");
    expect(validator).toContain('import Ajv from "ajv"');
    expect(validator).toContain("makeValidator");

    const test = fileByPath(result, "tests/listPets.test.ts");
    expect(test).toContain('import responseSchema from "../schemas/listPets.response.json"');
    expect(test).toContain("makeValidator(responseSchema)");

    // listPets declares an array response; the schema file should contain it.
    const schema = JSON.parse(fileByPath(result, "schemas/listPets.response.json"));
    expect(schema.type).toBe("array");
  });
});

describe("generatePlaywright", () => {
  it("produces one spec file covering all operations", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generatePlaywright(oas);
    const spec = fileByPath(result, "tests/api.spec.ts");
    expect(spec).toContain("request.get");
    expect(spec).toContain("request.post");
    expect(spec).toContain("/pets/stub-id");
    expect(spec).toContain("data: {}");
    expect(spec).toContain("makeValidator(listPetsSchema)");

    const config = fileByPath(result, "playwright.config.ts");
    expect(config).toContain("baseURL");
    expect(config).toContain("API_TOKEN");

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("tests/helpers/validator.ts");
    expect(paths).toContain("schemas/listPets.response.json");
  });
});

describe("generateSdkRust", () => {
  it("emits a reqwest::blocking client with Cargo.toml", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdkRust(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("Cargo.toml");
    expect(paths).toContain("src/lib.rs");

    const cargo = fileByPath(result, "Cargo.toml");
    expect(cargo).toContain(`name = "petstore-sdk"`);
    expect(cargo).toContain("reqwest");
    expect(cargo).toContain(`features = ["blocking", "json"]`);

    const lib = fileByPath(result, "src/lib.rs");
    expect(lib).toContain("pub struct PetstoreClient");
    expect(lib).toContain("pub fn new(base_url:");
    expect(lib).toContain("pub fn from_spec(");
    expect(lib).toContain("pub fn list_pets(");
    expect(lib).toContain("pub fn get_pet(");
    expect(lib).toContain("pub fn create_pet(");
    // Query params: Option wrapping
    expect(lib).toContain("limit: Option<i64>");
    // Path params: direct type
    expect(lib).toContain("id: &str");
  });
});

describe("generateSdkJava", () => {
  it("emits a Maven project with a stdlib HttpClient + Jackson", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdkJava(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("pom.xml");
    const clientPath = paths.find((p) => p.endsWith("/PetstoreClient.java"));
    expect(clientPath).toBeDefined();

    const pom = fileByPath(result, "pom.xml");
    expect(pom).toContain("<artifactId>petstore-sdk</artifactId>");
    expect(pom).toContain("<groupId>com.example</groupId>");
    expect(pom).toContain("jackson-databind");

    const client = fileByPath(result, clientPath!);
    expect(client).toContain("public class PetstoreClient");
    expect(client).toContain("public static PetstoreClient fromSpec(");
    expect(client).toContain("public Object listPets(");
    expect(client).toContain("public Object getPet(");
    expect(client).toContain("public Object createPet(");
    expect(client).toContain("java.net.http.HttpClient");
    // Optional query param → boxed type
    expect(client).toContain("Integer limit");
  });

  it("honours custom groupId / className", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdkJava(oas, { groupId: "io.acme", className: "PetstoreSDK" });
    const pom = fileByPath(result, "pom.xml");
    expect(pom).toContain("<groupId>io.acme</groupId>");
    const clientPath = result.files.find((f) =>
      f.path.endsWith("/PetstoreSDK.java"),
    )?.path;
    expect(clientPath).toBeDefined();
    expect(clientPath).toContain("io/acme/");
  });
});

describe("generateSdkPhp", () => {
  it("emits a Composer package with a Guzzle-backed client", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdkPhp(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("composer.json");
    expect(paths).toContain("src/Client.php");
    expect(paths).toContain("src/ApiException.php");

    const composer = JSON.parse(fileByPath(result, "composer.json"));
    expect(composer.name).toBe("example/petstore-sdk");
    expect(composer.require["guzzlehttp/guzzle"]).toBe("^7.0");
    expect(Object.keys(composer.autoload["psr-4"])[0]).toContain("Example");

    const client = fileByPath(result, "src/Client.php");
    expect(client).toContain("namespace Example\\Petstore;");
    expect(client).toContain("final class Client");
    expect(client).toContain("public static function fromSpec(");
    expect(client).toContain("public function listPets(");
    expect(client).toContain("public function getPet(");
    expect(client).toContain("public function createPet(");
    // Optional query param
    expect(client).toContain("?int $limit = null");
  });

  it("honours custom vendor / className", async () => {
    const oas = await Oas.fromFile(fixture);
    const result = generateSdkPhp(oas, { vendor: "acme", className: "ApiClient" });
    const composer = JSON.parse(fileByPath(result, "composer.json"));
    expect(composer.name).toBe("acme/petstore-sdk");
    expect(Object.keys(composer.autoload["psr-4"])[0]).toContain("Acme");
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("src/ApiClient.php");
  });
});

describe("typed models — Rust / Java / PHP / TS on a spec with components.schemas", () => {
  it("Rust emits serde structs and uses them in method signatures", async () => {
    const oas = await Oas.fromFile(typedFixture);
    const result = generateSdkRust(oas);
    const types = fileByPath(result, "src/types.rs");
    expect(types).toContain("pub struct Pet {");
    expect(types).toContain("pub struct Owner {");
    expect(types).toContain("pub struct Error {");
    expect(types).toContain("serde::Serialize, serde::Deserialize");

    const lib = fileByPath(result, "src/lib.rs");
    expect(lib).toContain("pub mod types;");
    expect(lib).toContain("pub use types::*;");
    // listPets returns `Vec<Pet>`, getPet returns `Pet`, createPet takes `&Pet`.
    expect(lib).toContain("-> Result<Vec<Pet>>");
    expect(lib).toContain("-> Result<Pet>");
    expect(lib).toContain("body: &Pet");
  });

  it("Java emits POJOs per components.schemas and typed return types", async () => {
    const oas = await Oas.fromFile(typedFixture);
    const result = generateSdkJava(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.endsWith("/Pet.java"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/Owner.java"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/Error.java"))).toBe(true);

    const clientPath = paths.find((p) => p.endsWith("/PetstoreTypedClient.java"))!;
    const client = fileByPath(result, clientPath);
    // typed returns
    expect(client).toContain("public java.util.List<Pet> listPets");
    expect(client).toContain("public Pet getPet");
    expect(client).toContain("public Pet createPet");
    expect(client).toContain("Pet body");
    // Uses Class.class for scalars and TypeReference for collections
    expect(client).toContain("Pet.class");
    expect(client).toContain("TypeReference<java.util.List<Pet>>");
  });

  it("PHP emits readonly DTOs with fromArray and uses them in signatures", async () => {
    const oas = await Oas.fromFile(typedFixture);
    const result = generateSdkPhp(oas);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("src/Pet.php");
    expect(paths).toContain("src/Owner.php");
    expect(paths).toContain("src/Error.php");

    const pet = fileByPath(result, "src/Pet.php");
    expect(pet).toContain("final class Pet");
    expect(pet).toContain("public readonly string $id");
    expect(pet).toContain("public static function fromArray(array $data): self");

    const client = fileByPath(result, "src/Client.php");
    // Typed returns: ?Pet, array of Pet
    expect(client).toContain("): ?Pet");
    expect(client).toContain("): array");
    expect(client).toContain("Pet::fromArray");
    expect(client).toContain("Pet $body");
  });

  it("TypeScript emits Schemas.X refs in the client", async () => {
    const oas = await Oas.fromFile(typedFixture);
    const result = generateSdk(oas);
    const client = fileByPath(result, "src/client.ts");
    expect(client).toContain("Promise<Schemas.Pet[]>");
    expect(client).toContain("Promise<Schemas.Pet>");
    expect(client).toContain("body: Schemas.Pet");

    const types = fileByPath(result, "src/types.ts");
    expect(types).toContain("export interface Pet");
    expect(types).toContain("export interface Owner");
  });
});

describe("async SDKs (Rust / Java / PHP)", () => {
  it("Rust --async swaps reqwest::blocking → reqwest::Client and `async fn`", async () => {
    const oas = await Oas.fromFile(typedFixture);
    const result = generateSdkRust(oas, { async: true });
    const cargo = fileByPath(result, "Cargo.toml");
    expect(cargo).toContain(`features = ["json"]`);
    expect(cargo).not.toContain(`"blocking"`);
    const lib = fileByPath(result, "src/lib.rs");
    expect(lib).toContain("use reqwest::Client as HttpClient;");
    expect(lib).toContain("pub async fn list_pets");
    expect(lib).toContain("pub async fn from_spec");
    expect(lib).toContain("self.send(req).await");
  });

  it("Java --async returns CompletableFuture via sendAsync", async () => {
    const oas = await Oas.fromFile(typedFixture);
    const result = generateSdkJava(oas, { async: true });
    const clientPath = result.files.find((f) =>
      f.path.endsWith("/PetstoreTypedClient.java"),
    )!.path;
    const client = fileByPath(result, clientPath);
    expect(client).toContain(
      "public java.util.concurrent.CompletableFuture<java.util.List<Pet>> listPets",
    );
    expect(client).toContain("public java.util.concurrent.CompletableFuture<Pet> createPet");
    expect(client).toContain("sendAsync(request, Pet.class)");
    expect(client).toContain("http.sendAsync(request,");
  });

  it("PHP --async returns Guzzle PromiseInterface", async () => {
    const oas = await Oas.fromFile(typedFixture);
    const result = generateSdkPhp(oas, { async: true });
    const client = fileByPath(result, "src/Client.php");
    expect(client).toContain(": \\GuzzleHttp\\Promise\\PromiseInterface");
    expect(client).toContain("$this->http->requestAsync(");
    expect(client).toContain("->then(function ($response)");
  });
});
