export default function DevelopersPage() {
  return (
    <article className="prose">
      <h1>API &amp; MCP</h1>
      <p>
        The same recipe data and diagram maths behind this site are available as a REST API and as a Model Context Protocol server, so other apps, bars'
        websites and AI assistants can use them.
      </p>

      <h2>REST API</h2>
      <p>
        Run <code>npm run dev:api</code> (port 3000). The OpenAPI description lives at <a href="/api/openapi.json">/api/openapi.json</a>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>What it returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>GET /api/cocktails?q=&amp;category=&amp;glass=&amp;ingredient=&amp;method=</code>
            </td>
            <td>Search and list</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/cocktails/aviation</code>
            </td>
            <td>Full recipe with steps, glass and history</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/cocktails/aviation/diagram.svg</code>
            </td>
            <td>The level diagram as an SVG image (<code>?labels=false&amp;width=240</code>)</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/cocktails/aviation/diagram.json</code>
            </td>
            <td>Layer volumes, fractions and colours</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/glasses</code>, <code>/api/glasses/coupe</code>, <code>/api/glasses/coupe.svg</code>
            </td>
            <td>Glassware catalogue and outlines</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/ingredients</code>
            </td>
            <td>Every ingredient with usage counts</td>
          </tr>
        </tbody>
      </table>
      <pre>
        <code>{`curl "http://localhost:3000/api/cocktails?ingredient=violette"
curl http://localhost:3000/api/cocktails/aviation/diagram.svg > aviation.svg`}</code>
      </pre>

      <h2>MCP server</h2>
      <p>
        The MCP server speaks stdio and exposes tools (<code>list_cocktails</code>, <code>search_cocktails</code>, <code>get_cocktail</code>,{" "}
        <code>get_cocktail_diagram</code>, <code>list_glasses</code>), resources (<code>cocktail://aviation</code>, <code>glass://coupe.svg</code>) and a{" "}
        <code>make_cocktail</code> prompt. Register it with Claude Desktop or Claude Code:
      </p>
      <pre>
        <code>{`{
  "mcpServers": {
    "bartender": {
      "command": "node",
      "args": ["/path/to/Bartender/packages/mcp/dist/index.js"]
    }
  }
}`}</code>
      </pre>
      <p>
        Or from a checkout: <code>claude mcp add bartender -- npx tsx packages/mcp/src/index.ts</code>.
      </p>

      <h2>Recipe format</h2>
      <p>
        Recipes are plain JSON validated by a schema in <code>@bartender/core</code>. Each carries a <code>source</code> and a <code>collection</code>, so
        recipes from bars and people can sit next to the IBA list later without changing the format. Amounts are stored in millilitres (or dashes, bar
        spoons and pieces) and converted for display.
      </p>
    </article>
  );
}
