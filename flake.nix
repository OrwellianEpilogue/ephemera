{
  description = "ephemera";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    pnpm2nix = {
      url = "github:FliegendeWurst/pnpm2nix-nzbr";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    pnpm2nix,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {inherit system;};

        inherit
          (pkgs)
          lib
          ;

        fullCleanSourceFilter = name: type:
          (lib.cleanSourceFilter name type)
          && (
            let
              baseName = baseNameOf (toString name);
            in
              baseName
              != "flake.nix"
              && baseName != "flake.lock"
              && baseName != "node_modules"
              && baseName != "dist"
              && baseName != ".git"
          );

        fullCleanSource = src:
          lib.cleanSourceWith {
            inherit src;
            filter = fullCleanSourceFilter;
          };

        packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      in {
        packages = {
          default = self.packages.${system}.ephemera;

          ephemera = pnpm2nix.packages.${system}.mkPnpmPackage {
            pname = "ephemera";
            version = packageJson.version + (lib.optionalString (self ? shortRev) "-${self.shortRev}");

            src = fullCleanSource ./.;
            packageJSON = ./package.json;
            pnpmLockYaml = ./pnpm-lock.yaml;

            workspace = fullCleanSource ./.;
            pnpmWorkspaceYaml = ./pnpm-workspace.yaml;

            # Remove pnpm version override from package.json if present
            preConfigure = ''
              cat package.json | grep -v 'packageManager' | sponge package.json
            '';

            postConfigure = ''
              patchShebangs --build node_modules
            '';

            extraNativeBuildInputs =
              [
                pkgs.patchelf
                pkgs.moreutils
                pkgs.makeBinaryWrapper
                pkgs.nodejs_22.python
              ]
              ++ lib.optionals pkgs.stdenv.isDarwin [
                pkgs.darwin.cctools
              ];

            preBuild = ''
              # Ensure better-sqlite3 is built before the main build
              SQLITE_PATH=$(find node_modules/.pnpm -type d -path "*/better-sqlite3@*/node_modules/better-sqlite3" | head -n 1)
              if [ -n "$SQLITE_PATH" ]; then
                echo "Building better-sqlite3 at $SQLITE_PATH"
                pushd "$SQLITE_PATH"
                npm run build-release || npm run install || {
                  echo "Failed to build better-sqlite3, trying node-gyp directly..."
                  ${pkgs.nodePackages.node-gyp}/bin/node-gyp rebuild
                }
                popd
              else
                echo "Warning: better-sqlite3 not found in node_modules"
              fi
            '';

            scriptFull = "pnpm run build";

            components = [
              "packages/shared"
              "packages/api"
              "packages/web"
            ];

            installPhase = ''
              runHook preInstall

              # Create directory structure
              mkdir -p $out/{bin,lib/ephemera}
              mkdir -p $out/lib/ephemera/packages/{shared,api,web}
              mkdir -p $out/lib/ephemera/packages/api/src

              # Copy built artifacts and dependencies
              cp -r packages/shared/dist $out/lib/ephemera/packages/shared/
              cp packages/shared/package.json $out/lib/ephemera/packages/shared/

              cp -r packages/api/dist $out/lib/ephemera/packages/api/
              cp packages/api/package.json $out/lib/ephemera/packages/api/
              cp -r packages/api/src/db $out/lib/ephemera/packages/api/src/

              cp -r packages/web/dist $out/lib/ephemera/packages/web/

              # Copy root node_modules
              cp -r node_modules $out/lib/ephemera/

              # Copy workspace-specific node_modules if they exist
              if [ -d packages/shared/node_modules ]; then
                cp -r packages/shared/node_modules $out/lib/ephemera/packages/shared/
              fi
              if [ -d packages/api/node_modules ]; then
                cp -r packages/api/node_modules $out/lib/ephemera/packages/api/
              fi
              if [ -d packages/web/node_modules ]; then
                cp -r packages/web/node_modules $out/lib/ephemera/packages/web/
              fi

              # Copy package files
              cp package.json pnpm-lock.yaml pnpm-workspace.yaml $out/lib/ephemera/

              # Create wrapper script
              makeWrapper ${lib.getExe pkgs.nodejs_22} $out/bin/ephemera \
                --set NODE_ENV production \
                --set-default PORT 8286 \
                --add-flags $out/lib/ephemera/packages/api/dist/index.js

              # Create wrapper script for database migrations
              makeWrapper ${lib.getExe pkgs.nodejs_22} $out/bin/ephemera-migrate \
                --set NODE_ENV production \
                --add-flags $out/lib/ephemera/packages/api/dist/db/migrate.js

              runHook postInstall
            '';

            postFixup = ''
              # Remove build artifacts from better-sqlite3 if present
              if [ -d $out/lib/ephemera/node_modules/better-sqlite3/build ]; then
                pushd $out/lib/ephemera/node_modules/better-sqlite3/build
                rm -rf Release/obj Release/obj.target Release/sqlite3.a \
                       Makefile better_sqlite3.target.mk binding.Makefile || true
                popd
              fi

              # Remove .bin symlinks that might cause issues
              rm $out/lib/ephemera/node_modules/.bin/* || true
            '';

            meta = with lib; {
              description = "ephemera";
              homepage = "https://github.com/OrwellianEpilogue/ephemera";
              license = licenses.mit;
              platforms = platforms.unix;
              mainProgram = "ephemera";
            };
          };
        };

        apps = {
          default = {
            type = "app";
            program = "${self.packages.${system}.ephemera}/bin/ephemera";
          };
        };
      }
    );
}
