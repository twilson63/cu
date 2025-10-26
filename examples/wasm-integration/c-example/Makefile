# Makefile for C + WAMR integration example
#
# This builds a standalone executable that runs lua.wasm using WAMR

CC = gcc
CFLAGS = -Wall -Wextra -O2 -std=c11
LDFLAGS = -lm

# WAMR configuration
WAMR_DIR = /opt/wamr-sdk
WAMR_INCLUDE = $(WAMR_DIR)/core/iwasm/include
WAMR_LIB = $(WAMR_DIR)/product-mini/platforms/linux/build/libvmlib.a

# Try to find WAMR in common locations
WAMR_SEARCH_PATHS = /opt/wamr-sdk /usr/local/wamr-sdk ./wamr-sdk

# Override with local paths if WAMR is not installed
ifeq ($(wildcard $(WAMR_INCLUDE)),)
    $(info WAMR not found at $(WAMR_DIR))
    $(info Please install WAMR or set WAMR_DIR to your installation)
    $(info See README.md for installation instructions)
    WAMR_INCLUDE = ./wamr-stub
    WAMR_LIB = 
endif

TARGET = lua-wasm-demo
SOURCES = main.c
OBJECTS = $(SOURCES:.c=.o)

.PHONY: all clean check-wamr

all: check-wamr $(TARGET)

check-wamr:
	@if [ ! -d "$(WAMR_INCLUDE)" ]; then \
		echo ""; \
		echo "ERROR: WAMR not found!"; \
		echo ""; \
		echo "Please install WAMR:"; \
		echo "  git clone https://github.com/bytecodealliance/wasm-micro-runtime.git"; \
		echo "  cd wasm-micro-runtime/product-mini/platforms/linux"; \
		echo "  mkdir build && cd build"; \
		echo "  cmake .."; \
		echo "  make"; \
		echo ""; \
		echo "Then set WAMR_DIR in this Makefile to point to your installation."; \
		echo ""; \
		exit 1; \
	fi

$(TARGET): $(OBJECTS)
	@echo "Linking $(TARGET)..."
	$(CC) $(OBJECTS) $(WAMR_LIB) $(LDFLAGS) -o $(TARGET)
	@echo "Build complete: ./$(TARGET)"

%.o: %.c
	@echo "Compiling $<..."
	$(CC) $(CFLAGS) -I$(WAMR_INCLUDE) -c $< -o $@

clean:
	rm -f $(OBJECTS) $(TARGET)
	@echo "Clean complete"

run: $(TARGET)
	./$(TARGET)

# Simplified build without WAMR (just compile check)
compile-check:
	$(CC) $(CFLAGS) -c main.c -o main.o
	@echo "Compile check passed"

help:
	@echo "Lua WASM + WAMR Example Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  all            - Build the executable (default)"
	@echo "  clean          - Remove build artifacts"
	@echo "  run            - Build and run the example"
	@echo "  compile-check  - Check if code compiles (without WAMR)"
	@echo "  help           - Show this help"
	@echo ""
	@echo "Requirements:"
	@echo "  - WAMR installed (see README.md)"
	@echo "  - lua.wasm in current directory"
	@echo ""
	@echo "Set WAMR_DIR to override default location:"
	@echo "  make WAMR_DIR=/path/to/wamr-sdk"
