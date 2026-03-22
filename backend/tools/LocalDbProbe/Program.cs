using Microsoft.Data.SqlClient;

var connectionString = "Server=(localdb)\\MSSQLLocalDB;Database=poems_db;Integrated Security=true;Encrypt=False;TrustServerCertificate=True;";

await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();

await using var command = connection.CreateCommand();
command.CommandText = "SELECT TOP 3 id, name, email, role FROM dbo.users ORDER BY id DESC";

await using var reader = await command.ExecuteReaderAsync();

while (await reader.ReadAsync())
{
    Console.WriteLine($"{reader["id"]} | {reader["name"]} | {reader["email"]} | {reader["role"]}");
}
