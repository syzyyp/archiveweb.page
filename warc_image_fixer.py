"""
Processes WARC files to fix image 'src' attributes in HTML content.

Many web archiving tools, especially for dynamic content like WeChat articles,
might store the actual image source in attributes like 'data-src' or 'data-backsrc'.
This script iterates through WARC files, specifically gzipped ones (.gz),
parses HTML content within response records, and updates the 'src' attribute
of 'img' tags to the correct source URL found in 'data-src' or 'data-backsrc'.
The modified WARC records are written to new WARC files with a "_fixed" suffix.
It takes an input folder containing WARC files and processes them, saving
the fixed versions in the same location.
"""
import os
import argparse
import logging # Added logging
import sys # Added sys for exit
from io import BytesIO
from warcio.archiveiterator import ArchiveIterator
from warcio.warcwriter import WARCWriter
from bs4 import BeautifulSoup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout) # Ensure logs go to stdout
    ]
)

def fix_html_img_src(html_bytes):
    """
    Parses HTML bytes and attempts to fix 'src' attributes of 'img' tags.

    It looks for 'data-src' or 'data-backsrc' attributes and uses their values
    to replace the 'src' attribute. Handles UTF-8 and GBK encodings.

    Args:
        html_bytes (bytes): The HTML content as bytes.

    Returns:
        bytes: The modified HTML content as bytes if changes were made,
               otherwise the original html_bytes.
    """
    try:
        html = html_bytes.decode('utf-8')
    except UnicodeDecodeError:
        html = html_bytes.decode('gbk', errors='replace') # Fallback for GBK encoding
    soup = BeautifulSoup(html, 'html.parser')
    changed = False
    for img in soup.find_all('img'):
        real_src = img.get('data-src') or img.get('data-backsrc')
        if real_src:
            # Ensure the URL is not empty and is a string
            if isinstance(real_src, str) and real_src.strip():
                img['src'] = real_src
                changed = True
            elif isinstance(real_src, list) and real_src: # Handle cases where attributes might be parsed as lists
                 # Prioritize the first non-empty string in the list
                for item in real_src:
                    if isinstance(item, str) and item.strip():
                        img['src'] = item
                        changed = True
                        break


    if changed:
        return str(soup).encode('utf-8')
    else:
        return html_bytes

def process_warc(input_warc, output_warc):
    """
    Processes a single WARC file to fix image sources in its HTML records.

    Reads records from input_warc. If a record is an HTML response,
    it attempts to fix image 'src' attributes using fix_html_img_src.
    Modified records and all other records are written to output_warc.

    Args:
        input_warc (str): Path to the input WARC file.
        output_warc (str): Path to the output WARC file where modified
                           content will be saved.
    """
    try:
        with open(input_warc, 'rb') as stream, open(output_warc, 'wb') as out_stream:
            writer = WARCWriter(out_stream, gzip=output_warc.endswith('.gz'))
            for record in ArchiveIterator(stream):
                if record.rec_type == 'response':
                    http_headers = record.http_headers
                    warc_target_uri = record.rec_headers.get_header('WARC-Target-URI')
                    content_type = http_headers.get_header('Content-Type') if http_headers else ''
                    if content_type and 'html' in content_type:
                        orig_bytes = record.content_stream().read()
                        fixed_bytes = orig_bytes # Default to original bytes

                        # Only attempt to fix images if the URI is from mp.weixin.qq.com
                        if warc_target_uri and 'mp.weixin.qq.com' in warc_target_uri:
                            logging.info(f"Processing HTML from mp.weixin.qq.com: {warc_target_uri}")
                            fixed_bytes = fix_html_img_src(orig_bytes) # fix_html_img_src returns original if no changes
                            if fixed_bytes != orig_bytes:
                                logging.info(f'[修复] Images fixed for {warc_target_uri} in {input_warc}')
                        else:
                            logging.info(f"Skipping image fix for non-mp.weixin.qq.com HTML URI: {warc_target_uri}")

                        # Only create a new record if bytes were actually changed.
                        if fixed_bytes != orig_bytes:
                            payload_stream = BytesIO(fixed_bytes)
                            new_rec = writer.create_warc_record(
                                warc_target_uri,
                                'response',
                                payload=payload_stream,
                                length=len(fixed_bytes),
                                http_headers=http_headers if http_headers else {}
                            )
                            writer.write_record(new_rec)
                            continue # Skip writing the original record for this modified one
                    # If not HTML, or HTML not modified, write the original record
                writer.write_record(record)
        logging.info(f"处理完成：{output_warc}")
    except IOError as e:
        logging.error(f"I/O error processing WARC file {input_warc} or {output_warc}: {e}")
    except Exception as e:
        logging.error(f"Unexpected error processing WARC file {input_warc}: {e}")


def process_folder(input_folder):
    """
    Walks through a folder and processes all gzipped WARC files found.

    For each .gz file, it generates an output filename with "_fixed.warc.gz"
    and calls process_warc.

    Args:
        input_folder (str): The path to the folder containing WARC files.
    """
    if not os.path.isdir(input_folder):
        logging.error(f"Input folder not found or is not a directory: {input_folder}")
        sys.exit(1)

    for root, dirs, files in os.walk(input_folder):
        for file in files:
            if file.endswith('.gz'): # Assuming WARC files are gzipped
                input_warc = os.path.join(root, file)
                # Ensure the output file has a distinct name, e.g., by adding "_fixed"
                base, ext = os.path.splitext(file) # ext will be .gz
                if base.endswith('.warc'): # if like xxx.warc.gz, base is xxx.warc
                    output_warc_name = f"{base.rsplit('.',1)[0]}_fixed.warc{ext}"
                else: # if like xxx.gz, base is xxx
                     output_warc_name = f"{base}_fixed.warc{ext}"
                output_warc = os.path.join(root, output_warc_name)


                logging.info(f"开始处理: {input_warc} -> {output_warc}")
                process_warc(input_warc, output_warc)

if __name__ == '__main__':
    """
    Main execution block. Parses command-line arguments for the input folder
    and starts the WARC processing.
    """
    parser = argparse.ArgumentParser(
        description="Process WARC files in a folder to fix image 'src' attributes in HTML content. "
                    "Corrects 'img' tags where the actual image source is in 'data-src' or 'data-backsrc'. "
                    "Outputs new WARC files with '_fixed' appended to their names."
    )
    parser.add_argument("input_folder", help="The path to the folder containing gzipped WARC files (.gz) to process.")
    args = parser.parse_args()
    process_folder(args.input_folder)
