# WARC Image Source Fixer

## Overview

`warc_image_fixer.py` is a Python script designed to process WARC (Web ARChive) files, specifically those compressed with gzip (`.gz` extension). Its primary function is to correct `<img>` tag `src` attributes within HTML content stored in these WARC files.

Web crawlers and archiving tools sometimes store the actual image URL in attributes like `data-src` or `data-backsrc`, particularly for content from dynamic websites such as `mp.weixin.qq.com` (WeChat Official Account articles). This script parses the HTML, identifies such cases, and updates the `src` attribute to point to the correct image URL. This ensures that images are displayed correctly when replaying or analyzing the archived content.

The script processes each qualifying `.gz` file in the specified input folder (and its subdirectories) and creates a new WARC file with the `_fixed.warc.gz` suffix in the same location as the original file. Original files are not modified.

## Dependencies

*   **Python 3**: The script is written for Python 3.
*   **Required Packages**: The script relies on the following Python packages:
    *   `warcio`: For reading and writing WARC files.
    *   `beautifulsoup4`: For parsing HTML content.

    These dependencies are listed in the `requirements.txt` file.

## Installation

To install the necessary dependencies, navigate to the root directory of this repository in your terminal and run:

```bash
pip install -r requirements.txt
```

Ensure you have Python 3 and pip installed on your system.

## Usage

To use the script, run it from the command line, providing the path to the folder containing your WARC files as a command-line argument.

```bash
python warc_image_fixer.py /path/to/your/warc_files
```

Replace `/path/to/your/warc_files` with the actual path to the directory where your `.gz` WARC files are stored.

The script will:
*   Scan the specified folder and all its subdirectories for files ending with `.gz`.
*   For each `.gz` file found, it will attempt to process it as a WARC file.
*   HTML content within the WARC records will be checked, and `<img>` tag sources will be fixed if necessary.
*   A new file with the suffix `_fixed.warc.gz` (e.g., `original.warc.gz` becomes `original_fixed.warc.gz`, and `archive.gz` becomes `archive_fixed.warc.gz`) will be created in the same directory as the original file, containing the processed records.
*   The script will output logs to the console indicating its progress, including files being processed, fixes made, and any errors encountered.

For example, if you have WARC files in a directory named `my_archive_collection`, you would run:
```bash
python warc_image_fixer.py ./my_archive_collection
```
