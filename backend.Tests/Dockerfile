# Build context is the repository root (see docker-compose.yml), because the
# tests reference the backend project.
FROM mcr.microsoft.com/dotnet/sdk:9.0
WORKDIR /src
COPY backend/backend.csproj backend/
COPY backend.Tests/backend.Tests.csproj backend.Tests/
RUN dotnet restore backend.Tests/backend.Tests.csproj
COPY backend backend
COPY backend.Tests backend.Tests
RUN dotnet build backend.Tests/backend.Tests.csproj --no-restore
CMD ["dotnet", "test", "backend.Tests/backend.Tests.csproj", "--no-build", "--logger", "console;verbosity=normal"]
